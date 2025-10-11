import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, Filter, Clock, Users, TrendingUp } from 'lucide-react'
import apiClient from '../api/client'

export default function MarketsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch markets - WebSocket'i kaldırdık çünkü gereksiz
  const { data, isLoading, error } = useQuery({
    queryKey: ['markets', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const response = await apiClient.get(`/markets${params}`)
      return response.data.data
    }
  })

  // Filter markets by search
  const filteredMarkets = data?.filter(market =>
    market.title.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Pazarlar</h1>
        <p className="text-gray-600">Aktif tahmin pazarlarını keşfet ve görüşünü paylaş</p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Pazar ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Tümü' },
            { value: 'open', label: 'Açık' },
            { value: 'closed', label: 'Kapandı' },
            { value: 'resolved', label: 'Sonuçlandı' }
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-md p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-red-800">
            Pazarlar yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredMarkets.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Pazar bulunamadı</h3>
          <p className="text-gray-600">Arama kriterlerinize uygun pazar bulunamadı.</p>
        </div>
      )}

      {/* Markets Grid */}
      {!isLoading && !error && filteredMarkets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMarkets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  )
}

function MarketCard({ market }) {
  // Calculate probability from market data
  const yesProb = 50 // TODO: Get from order book
  const noProb = 50

  const getStatusBadge = (status) => {
    const badges = {
      open: 'bg-green-100 text-green-700',
      closed: 'bg-blue-100 text-blue-700',
      resolved: 'bg-gray-100 text-gray-700'
    }
    const labels = {
      open: 'Açık',
      closed: 'Kapandı',
      resolved: 'Sonuçlandı'
    }
    return { badge: badges[status] || badges.open, label: labels[status] || 'Açık' }
  }

  const { badge, label } = getStatusBadge(market.status)

  const formatVolume = (volume) => {
    if (!volume) return '₺0'
    const num = parseFloat(volume)
    if (num >= 1000000) return `₺${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `₺${(num / 1000).toFixed(0)}K`
    return `₺${num.toFixed(0)}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = date - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) return 'Kapandı'
    if (diffDays === 0) return 'Bugün'
    if (diffDays === 1) return 'Yarın'
    return `${diffDays} gün`
  }

  return (
    <Link 
      to={`/markets/${market.id}`}
      className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-6 block group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge}`}>
          {label}
        </span>
        {market.category && (
          <span className="text-xs text-gray-500 capitalize">
            {market.category}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-brand-600 transition-colors line-clamp-2">
        {market.title}
      </h3>

      {/* Description */}
      {market.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {market.description}
        </p>
      )}

      {/* Probabilities */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <div className="text-xs text-green-600 font-medium mb-1">EVET</div>
          <div className="text-2xl font-bold text-green-700">{yesProb}%</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <div className="text-xs text-red-600 font-medium mb-1">HAYIR</div>
          <div className="text-2xl font-bold text-red-700">{noProb}%</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-gray-600 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-4 h-4" />
          <span>{formatVolume(market.volume)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          <span>{market.tradersCount || 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>{formatDate(market.closing_date)}</span>
        </div>
      </div>
    </Link>
  )
}