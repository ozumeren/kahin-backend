import { useState, useEffect } from 'react';

/**
 * Hook for responsive chart configurations
 * Adjusts chart settings based on screen size
 */
export function useChartResponsive() {
  const [config, setConfig] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    margin: { top: 20, right: 40, bottom: 50, left: 50 },
    showGrid: true,
    showArea: true,
    showTooltip: true,
    chartHeight: 400,
    fontSize: 12,
    strokeWidth: 2.5,
  });

  useEffect(() => {
    function updateConfig() {
      const width = window.innerWidth;
      
      if (width < 640) {
        // Mobile
        setConfig({
          isMobile: true,
          isTablet: false,
          isDesktop: false,
          margin: { top: 10, right: 15, bottom: 35, left: 35 },
          showGrid: false,
          showArea: true,
          showTooltip: true,
          chartHeight: 250,
          fontSize: 10,
          strokeWidth: 2,
        });
      } else if (width < 1024) {
        // Tablet
        setConfig({
          isMobile: false,
          isTablet: true,
          isDesktop: false,
          margin: { top: 15, right: 25, bottom: 40, left: 40 },
          showGrid: true,
          showArea: true,
          showTooltip: true,
          chartHeight: 320,
          fontSize: 11,
          strokeWidth: 2.5,
        });
      } else {
        // Desktop
        setConfig({
          isMobile: false,
          isTablet: false,
          isDesktop: true,
          margin: { top: 20, right: 40, bottom: 50, left: 50 },
          showGrid: true,
          showArea: true,
          showTooltip: true,
          chartHeight: 400,
          fontSize: 12,
          strokeWidth: 2.5,
        });
      }
    }

    // Initial config
    updateConfig();

    // Listen to window resize
    window.addEventListener('resize', updateConfig);
    
    return () => window.removeEventListener('resize', updateConfig);
  }, []);

  return config;
}

/**
 * Get optimal number of ticks based on chart width
 */
export function getOptimalTicks(width, dataLength) {
  if (width < 400) return Math.min(3, dataLength);
  if (width < 600) return Math.min(5, dataLength);
  if (width < 800) return Math.min(6, dataLength);
  return Math.min(8, dataLength);
}

/**
 * Format axis labels for different screen sizes
 */
export function formatAxisLabel(value, type, isMobile) {
  if (type === 'time') {
    if (isMobile) {
      return new Date(value).toLocaleTimeString('tr-TR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    return new Date(value).toLocaleString('tr-TR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  if (type === 'price') {
    if (isMobile) {
      return `₺${value.toFixed(0)}`;
    }
    return `₺${value.toFixed(2)}`;
  }
  
  return value;
}

/**
 * Get touch-friendly chart padding
 */
export function getTouchPadding(isMobile) {
  return isMobile ? 16 : 8;
}