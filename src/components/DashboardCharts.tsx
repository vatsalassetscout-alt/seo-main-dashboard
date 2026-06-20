import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { SiteData, TimeSeriesEntry } from '../types';

Chart.register(...registerables);

/**
 * Combined Line Chart for All Websites over time
 */
interface PerformanceChartProps {
  data: TimeSeriesEntry[];
  activeMetrics: Set<string>;
  isDark: boolean;
}

export function PerformanceChart({ data, activeMetrics, isDark }: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    if (!data || data.length === 0) return;

    const labels = data.map(d => {
      const parts = d.date.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (parts.length === 3) {
        const mIdx = parseInt(parts[1]) - 1;
        return `${monthNames[mIdx]} ${parseInt(parts[2])}`;
      }
      if (parts.length === 2) {
        const mIdx = parseInt(parts[1]) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          return `${monthNames[mIdx]} ${parts[0]}`;
        }
      }
      return d.date;
    });

    const datasets: any[] = [];
    
    if (activeMetrics.has('clicks')) {
      datasets.push({
        label: 'Clicks',
        data: data.map(d => d.clicks),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f620',
        borderWidth: 1.5,
        pointRadius: data.length > 90 ? 0 : 2,
        pointHoverRadius: 4,
        tension: 0.3,
        yAxisID: 'y'
      });
    }

    if (activeMetrics.has('impressions')) {
      datasets.push({
        label: 'Impressions',
        data: data.map(d => d.impressions),
        borderColor: '#8b5cf6',
        backgroundColor: '#8b5cf620',
        borderWidth: 1.5,
        pointRadius: data.length > 90 ? 0 : 2,
        pointHoverRadius: 4,
        tension: 0.3,
        yAxisID: 'y'
      });
    }

    if (activeMetrics.has('ctr')) {
      datasets.push({
        label: 'CTR (%)',
        data: data.map(d => d.ctr),
        borderColor: '#10b981',
        backgroundColor: '#10b98120',
        borderWidth: 1.5,
        pointRadius: data.length > 90 ? 0 : 2,
        pointHoverRadius: 4,
        tension: 0.3,
        yAxisID: 'y1'
      });
    }

    if (activeMetrics.has('position')) {
      datasets.push({
        label: 'Avg Position',
        data: data.map(d => d.position),
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b20',
        borderWidth: 1.5,
        pointRadius: data.length > 90 ? 0 : 2,
        pointHoverRadius: 4,
        tension: 0.3,
        yAxisID: 'y2'
      });
    }

    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#475569';

    chartInstance.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (label.includes('CTR')) return ` ${label}: ${val.toFixed(2)}%`;
                if (label.includes('Position')) return ` ${label}: ${val.toFixed(1)}`;
                return ` ${label}: ${val.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' } }
          },
          y: {
            position: 'left',
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit' } },
            title: { display: true, text: 'Clicks / Impressions', color: textColor }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Outfit' } },
            title: { display: true, text: 'CTR (%)', color: textColor }
          },
          y2: {
            position: 'right',
            grid: { display: false },
            reverse: true,
            ticks: { color: textColor, font: { family: 'Outfit' } },
            title: { display: true, text: 'Position', color: textColor }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data, activeMetrics, isDark]);

  return (
    <div className="relative w-full h-full min-h-[260px]">
      <canvas ref={canvasRef} />
    </div>
  );
}

/**
 * Top Sites Bar Chart (Either by Clicks or CTR)
 */
interface TopSitesBarChartProps {
  sites: { name: string; clicks: number; ctr: number; [key: string]: any }[];
  metric: 'clicks' | 'ctr';
  isDark: boolean;
}

export function TopSitesBarChart({ sites, metric, isDark }: TopSitesBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    if (!sites || sites.length === 0) return;

    // Filter, sort, and slice top 10
    const topSites = [...sites]
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 10);

    const labels = topSites.map(s => s.name.length > 22 ? s.name.slice(0, 19) + '...' : s.name);
    const dataValues = topSites.map(s => s[metric]);

    const barColor = metric === 'clicks' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(16, 185, 129, 0.85)';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)';
    const tickColor = isDark ? '#cbd5e1' : '#1e293b';

    chartInstance.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: dataValues,
          backgroundColor: barColor,
          borderRadius: 4,
          borderWidth: 0,
          barThickness: 12
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const val = context.parsed.x;
                return metric === 'ctr' ? ` CTR: ${val.toFixed(2)}%` : ` Clicks: ${val.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'Outfit', size: 10, weight: 'bold' },
              callback: (val) => metric === 'ctr' ? `${val}%` : val.toLocaleString()
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: tickColor,
              font: { family: 'Outfit', size: 10, weight: 'bold' }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [sites, metric, isDark]);

  return (
    <div className="relative w-full h-[240px]">
      <canvas ref={canvasRef} />
    </div>
  );
}

/**
 * Site Specific Time Series (with daily / weekly / monthly aggregated view)
 */
interface SiteDetailsChartProps {
  data: TimeSeriesEntry[];
  isDark: boolean;
}

export function SiteDetailsChart({ data, isDark }: SiteDetailsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    if (!data || data.length === 0) return;

    const labels = data.map(d => {
      const parts = d.date.split('-');
      if (parts.length === 3) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(parts[1]) - 1;
        return `${monthNames[mIdx]} ${parseInt(parts[2])}`;
      }
      return d.date;
    });

    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#475569';

    chartInstance.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Clicks',
            data: data.map(d => d.clicks),
            borderColor: '#3b82f6',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'Impressions',
            data: data.map(d => d.impressions),
            borderColor: '#8b5cf6',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'CTR (%)',
            data: data.map(d => d.ctr),
            borderColor: '#10b981',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            yAxisID: 'y1'
          },
          {
            label: 'Position',
            data: data.map(d => d.position),
            borderColor: '#f59e0b',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: 'Outfit', size: 10 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (label.includes('CTR')) return ` ${label}: ${val.toFixed(2)}%`;
                if (label.includes('Position')) return ` ${label}: ${val.toFixed(1)}`;
                return ` ${label}: ${val.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Clicks / Impressions', color: textColor, font: { size: 10 } },
            ticks: { color: textColor, font: { size: 10 } },
            grid: { color: gridColor }
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'CTR (%)', color: textColor, font: { size: 10 } },
            ticks: { color: textColor, font: { size: 10 } },
            grid: { display: false }
          },
          y2: {
            position: 'right',
            title: { display: true, text: 'Position', color: textColor, font: { size: 10 } },
            ticks: { color: textColor, font: { size: 10 } },
            reverse: true,
            grid: { display: false }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data, isDark]);

  return (
    <div className="relative w-full h-[220px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
