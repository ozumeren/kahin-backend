// src/services/contract.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { MarketContract, ContractResolutionEvidence, ContractAmendment, Market, User, sequelize } = db;
const ApiError = require('../utils/apiError');

class ContractService {
  // CREATE CONTRACT
  async createContract(userId, contractData) {
    const t = await sequelize.transaction();

    try {
      // Validate contract code uniqueness
      const existing = await MarketContract.findOne({
        where: { contract_code: contractData.contract_code }
      });

      if (existing) {
        throw ApiError.badRequest('Bu contract code zaten kullanılıyor.');
      }

      // Create contract
      const contract = await MarketContract.create({
        ...contractData,
        created_by: userId,
        status: 'draft',
        version: 1
      }, { transaction: t });

      await t.commit();

      console.log(`✅ Contract created: ${contract.contract_code} by user ${userId}`);

      return contract;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // LIST CONTRACTS (with filters)
  async listContracts(filters = {}) {
    const { status, search, created_by, sort = 'created_at', order = 'DESC', limit = 50, offset = 0 } = filters;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (created_by) {
      where.created_by = created_by;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { contract_code: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { rows: contracts, count } = await MarketContract.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'username', 'email']
        },
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'status'],
          required: false
        }
      ],
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return {
      contracts,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  }

  // GET CONTRACT BY ID
  async getContractById(contractId) {
    const contract = await MarketContract.findByPk(contractId, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email', 'avatar_url']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'email']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'username', 'email']
        },
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'status', 'total_volume'],
          required: false
        },
        {
          model: ContractResolutionEvidence,
          as: 'evidence',
          include: [
            {
              model: User,
              as: 'collector',
              attributes: ['id', 'username']
            }
          ]
        },
        {
          model: ContractAmendment,
          as: 'amendments',
          include: [
            {
              model: User,
              as: 'creator',
              attributes: ['id', 'username']
            }
          ],
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    return contract;
  }

  // GET CONTRACT BY CODE
  async getContractByCode(contractCode) {
    const contract = await MarketContract.findOne({
      where: { contract_code: contractCode },
      include: [
        {
          model: Market,
          as: 'market',
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    return contract;
  }

  // UPDATE CONTRACT (only drafts or create amendment)
  async updateContract(contractId, userId, updates) {
    const t = await sequelize.transaction();

    try {
      const contract = await MarketContract.findByPk(contractId, { transaction: t });

      if (!contract) {
        throw ApiError.notFound('Contract bulunamadı.');
      }

      // If contract is draft, allow direct update
      if (contract.status === 'draft') {
        await contract.update(updates, { transaction: t });
        await t.commit();

        console.log(`✅ Contract updated: ${contract.contract_code}`);
        return contract;
      }

      // If contract is approved/active, require amendment
      if (['approved', 'active'].includes(contract.status)) {
        if (!updates.amendment_reason) {
          throw ApiError.badRequest('Onaylanmış contract\'lar için amendment_reason gerekli.');
        }

        // Create amendments for changed fields
        const changedFields = Object.keys(updates).filter(key => key !== 'amendment_reason');

        for (const field of changedFields) {
          await ContractAmendment.create({
            contract_id: contractId,
            amendment_type: 'modification',
            field_changed: field,
            old_value: String(contract[field]),
            new_value: String(updates[field]),
            reason: updates.amendment_reason,
            created_by: userId
          }, { transaction: t });
        }

        // Update contract and increment version
        const updateData = { ...updates };
        delete updateData.amendment_reason;
        updateData.version = contract.version + 1;
        updateData.status = 'pending_review'; // Reset to pending review

        await contract.update(updateData, { transaction: t });
        await t.commit();

        console.log(`✅ Contract amended: ${contract.contract_code} (v${updateData.version})`);
        return contract;
      }

      throw ApiError.badRequest('Bu contract güncellenemez.');
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // SUBMIT CONTRACT FOR REVIEW
  async submitForReview(contractId, userId) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    if (contract.created_by !== userId) {
      throw ApiError.forbidden('Bu contract\'ı submit edemezsiniz.');
    }

    if (contract.status !== 'draft') {
      throw ApiError.badRequest('Sadece draft contract\'lar review için gönderilebilir.');
    }

    await contract.update({
      status: 'pending_review'
    });

    console.log(`✅ Contract submitted for review: ${contract.contract_code}`);

    return contract;
  }

  // REVIEW CONTRACT
  async reviewContract(contractId, userId, reviewData) {
    const t = await sequelize.transaction();

    try {
      const contract = await MarketContract.findByPk(contractId, { transaction: t });

      if (!contract) {
        throw ApiError.notFound('Contract bulunamadı.');
      }

      if (contract.status !== 'pending_review') {
        throw ApiError.badRequest('Bu contract review edilebilir durumda değil.');
      }

      const { approved, notes, required_changes } = reviewData;

      if (approved) {
        await contract.update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date()
        }, { transaction: t });

        console.log(`✅ Contract approved: ${contract.contract_code}`);
      } else {
        // Return to draft with required changes
        await contract.update({
          status: 'draft',
          reviewed_by: userId,
          reviewed_at: new Date()
        }, { transaction: t });

        // Log required changes as amendment
        if (required_changes && required_changes.length > 0) {
          await ContractAmendment.create({
            contract_id: contractId,
            amendment_type: 'review_feedback',
            reason: notes || 'Review feedback',
            old_value: JSON.stringify(required_changes),
            created_by: userId
          }, { transaction: t });
        }

        console.log(`❌ Contract rejected: ${contract.contract_code}`);
      }

      await t.commit();
      return contract;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // APPROVE CONTRACT (final approval)
  async approveContract(contractId, userId) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    if (contract.status !== 'approved') {
      throw ApiError.badRequest('Contract önce review edilmeli.');
    }

    await contract.update({
      approved_by: userId,
      approved_at: new Date()
    });

    console.log(`✅ Contract final approval: ${contract.contract_code}`);

    return contract;
  }

  // PUBLISH CONTRACT (make active and attach to market)
  async publishContract(contractId, marketId) {
    const t = await sequelize.transaction();

    try {
      const contract = await MarketContract.findByPk(contractId, { transaction: t });

      if (!contract) {
        throw ApiError.notFound('Contract bulunamadı.');
      }

      if (contract.status !== 'approved') {
        throw ApiError.badRequest('Contract yayınlanmadan önce onaylanmalı.');
      }

      // Verify market exists
      const market = await Market.findByPk(marketId, { transaction: t });
      if (!market) {
        throw ApiError.notFound('Market bulunamadı.');
      }

      // Update contract
      await contract.update({
        market_id: marketId,
        status: 'active',
        published_at: new Date()
      }, { transaction: t });

      await t.commit();

      console.log(`✅ Contract published: ${contract.contract_code} -> Market ${marketId}`);

      return contract;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // ADD RESOLUTION EVIDENCE
  async addEvidence(contractId, userId, evidenceData) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    const evidence = await ContractResolutionEvidence.create({
      contract_id: contractId,
      ...evidenceData,
      collected_by: userId,
      collected_at: evidenceData.collected_at || new Date()
    });

    console.log(`✅ Evidence added to contract: ${contract.contract_code}`);

    return evidence;
  }

  // VERIFY EVIDENCE
  async verifyEvidence(evidenceId, userId) {
    const evidence = await ContractResolutionEvidence.findByPk(evidenceId);

    if (!evidence) {
      throw ApiError.notFound('Evidence bulunamadı.');
    }

    await evidence.update({
      verified: true,
      verified_by: userId,
      verified_at: new Date()
    });

    console.log(`✅ Evidence verified: ${evidenceId}`);

    return evidence;
  }

  // RESOLVE CONTRACT
  async resolveContract(contractId, userId, resolutionData) {
    const t = await sequelize.transaction();

    try {
      const contract = await MarketContract.findByPk(contractId, {
        include: [
          {
            model: Market,
            as: 'market'
          },
          {
            model: ContractResolutionEvidence,
            as: 'evidence'
          }
        ],
        transaction: t
      });

      if (!contract) {
        throw ApiError.notFound('Contract bulunamadı.');
      }

      if (contract.status !== 'active' && contract.status !== 'expired') {
        throw ApiError.badRequest('Bu contract çözümlenebilir durumda değil.');
      }

      const { outcome, expiration_value, resolution_notes, evidence_ids } = resolutionData;

      // Verify evidence exists and is verified
      if (evidence_ids && evidence_ids.length > 0) {
        const evidenceList = contract.evidence.filter(e => evidence_ids.includes(e.id));
        const unverifiedEvidence = evidenceList.filter(e => !e.verified);

        if (unverifiedEvidence.length > 0) {
          throw ApiError.badRequest('Tüm kanıtlar doğrulanmalı.');
        }
      }

      // Update contract
      await contract.update({
        status: 'resolved',
        resolved_outcome: outcome,
        expiration_value: expiration_value,
        resolution_notes: resolution_notes,
        resolved_at: new Date()
      }, { transaction: t });

      // If contract has a market, resolve the market too
      if (contract.market) {
        // Here you would call your market resolution logic
        // await marketService.resolveMarket(contract.market_id, outcome, t);
        console.log(`🔄 Market resolution should be triggered for: ${contract.market_id}`);
      }

      await t.commit();

      console.log(`✅ Contract resolved: ${contract.contract_code} -> ${outcome ? 'YES' : 'NO'}`);

      return contract;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // GET CONTRACT TEMPLATES
  async getTemplates() {
    // These would be pre-defined templates
    return [
      {
        id: 'template-crypto-price',
        name: 'Cryptocurrency Price Threshold',
        category: 'crypto',
        description: 'Template for crypto price prediction markets',
        default_source_agencies: [
          { name: 'CoinGecko', url: 'https://www.coingecko.com', type: 'primary' },
          { name: 'CoinMarketCap', url: 'https://coinmarketcap.com', type: 'backup' }
        ],
        default_contingency_rules: [
          {
            scenario: 'source_unavailable',
            rule: 'If primary source is unavailable, backup source will be used.'
          },
          {
            scenario: 'disputed_value',
            rule: 'Disputes must be filed within 24 hours with evidence.'
          }
        ],
        default_settlement_value: 1.00,
        default_expiration_time: '23:59:59',
        default_expiration_timezone: 'America/New_York'
      },
      {
        id: 'template-sports',
        name: 'Sports Event Outcome',
        category: 'sports',
        description: 'Template for sports prediction markets',
        default_source_agencies: [
          { name: 'ESPN', url: 'https://www.espn.com', type: 'primary' },
          { name: 'Official League Website', url: '', type: 'backup' }
        ],
        default_contingency_rules: [
          {
            scenario: 'event_postponed',
            rule: 'If event is postponed, market remains open until event occurs or 2 years pass.'
          },
          {
            scenario: 'event_cancelled',
            rule: 'If event is cancelled permanently, all positions are refunded.'
          }
        ],
        default_settlement_value: 1.00,
        default_expiration_time: '23:59:59'
      },
      {
        id: 'template-politics',
        name: 'Political Event',
        category: 'politics',
        description: 'Template for political prediction markets',
        default_source_agencies: [
          { name: 'Associated Press', url: 'https://apnews.com', type: 'primary' },
          { name: 'Reuters', url: 'https://www.reuters.com', type: 'backup' }
        ],
        default_contingency_rules: [
          {
            scenario: 'delayed_announcement',
            rule: 'Market will wait up to 30 days for official announcement before review.'
          }
        ],
        default_settlement_value: 1.00,
        default_expiration_time: '10:00:00',
        default_expiration_timezone: 'America/New_York'
      }
    ];
  }

  // DELETE CONTRACT (only drafts)
  async deleteContract(contractId, userId) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw ApiError.notFound('Contract bulunamadı.');
    }

    if (contract.created_by !== userId) {
      throw ApiError.forbidden('Bu contract\'ı silemezsiniz.');
    }

    if (contract.status !== 'draft') {
      throw ApiError.badRequest('Sadece draft contract\'lar silinebilir.');
    }

    await contract.destroy();

    console.log(`✅ Contract deleted: ${contract.contract_code}`);

    return { success: true };
  }
}

module.exports = new ContractService();
