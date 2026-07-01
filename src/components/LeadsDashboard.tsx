import React, { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import {
  Calendar,
  X,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  ChevronDown,
  Info,
  ExternalLink
} from 'lucide-react';

const SHEET_ID = "14TBSWEZ4rlIkLECg2MrBCUYFwy8coCzISZUqJW_lCOc";
const SHEET_NAME = "Sheet1";
const API_KEY = "AIzaSyBayWQDOC1xhIlrzyzG9pFNEaKKh8wjFhY";

const ZONE_LOCATIONS = {
  west: [
    "Akurdi", "Balewadi", "Baner", "Bavdhan", "Bhugaon", "Chinchwad", "Gahunje", "Hinjewadi",
    "Kiwale", "Mahalunge", "Mamurdi", "Mundhwa", "Pashan", "Pimple Nilakh", "Pimple Saudagar",
    "Punawale", "Rahatani", "Ravet", "Sangavi", "Sus", "Tathawade", "Thergaon", "Wakad",
    "Pimpari", "Somatane Phata"
  ],
  north: [
    "Bhosari", "Charholi", "Chikhali", "Chovisawadi", "Dudulgaon", "Moshi", "Alandi", "Chakan"
  ]
};

interface SheetRow {
  timestamp: string;
  projectName: string;
  source: string;
  location: string;
}

export function LeadsDashboard({ theme }: { theme: 'light' | 'dark' }) {
  const [allData, setAllData] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter states
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [currentZone, setCurrentZone] = useState<'west' | 'mid' | 'north'>('mid');

  // Search input inside dropdowns
  const [locationSearch, setLocationSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');

  // Dropdown open states
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Modal detail states
  const [selectedProjectForModal, setSelectedProjectForModal] = useState<string | null>(null);

  // References for Chart canvases
  const timeseriesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const locationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourcesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // References for Chart instances to destroy them properly
  const timeseriesChartInstance = useRef<Chart | null>(null);
  const locationChartInstance = useRef<Chart | null>(null);
  const sourcesChartInstance = useRef<Chart | null>(null);

  // References to filter dropdown outer containers to prevent premature closing when selecting options
  const projectRef = useRef<HTMLDivElement | null>(null);
  const locationRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);

  const fetchSheetData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A:D?key=${API_KEY}`;
      const response = await fetch(url);
      if (response.status === 404) throw new Error('Sheet not found');
      if (response.status === 403) throw new Error('Access denied (API key disabled or private sheet)');
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const values = data.values || [];

      if (values.length <= 1) {
        setAllData([]);
        return;
      }

      const rows: SheetRow[] = [];
      for (let i = 1; i < values.length; i++) {
        const r = values[i];
        if (r[0] && r[1]) {
          rows.push({
            timestamp: r[0] || '',
            projectName: r[1] || '',
            source: r[2] || '',
            location: r[3] || ''
          });
        }
      }
      setAllData(rows);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Unknown network error occurred while fetching Sheet data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSheetData();

    return () => {
      // Clean up Chart instances on component unmount
      if (timeseriesChartInstance.current) timeseriesChartInstance.current.destroy();
      if (locationChartInstance.current) locationChartInstance.current.destroy();
      if (sourcesChartInstance.current) sourcesChartInstance.current.destroy();
    };
  }, []);

  // Helpers for parsing date formats safely
  const parseFlexibleDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === 'string') {
      const cleanStr = v.trim();
      // DD/MM/YYYY or DD-MM-YYYY
      let m = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m) {
        let dt = new Date(+m[3], +m[2] - 1, +m[1]);
        let tm = cleanStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (tm) dt.setHours(+tm[1], +tm[2], tm[3] ? +tm[3] : 0);
        if (!isNaN(dt.getTime())) return dt;
      }
      // YYYY/MM/DD or YYYY-MM-DD
      let m2 = cleanStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m2) {
        let dt = new Date(+m2[1], +m2[2] - 1, +m2[3]);
        let tm = cleanStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (tm) dt.setHours(+tm[1], +tm[2], tm[3] ? +tm[3] : 0);
        if (!isNaN(dt.getTime())) return dt;
      }
      // Default browser parse
      let d = new Date(cleanStr);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof v === 'number') {
      let d = new Date((v - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const formatDisplayDate = (v: any): string => {
    let d = parseFlexibleDate(v);
    if (!d) return String(v);
    let dd = String(d.getDate()).padStart(2, '0');
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let hh = String(d.getHours()).padStart(2, '0');
    let mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
  };

  // List of all unique properties from sheet for filters
  const uniqueOptionLists = useMemo(() => {
    const locationsSet = new Set<string>();
    const sourcesSet = new Set<string>();
    const projectsSet = new Set<string>();

    allData.forEach(r => {
      if (r.location) locationsSet.add(r.location);
      if (r.source) sourcesSet.add(r.source);
      if (r.projectName) projectsSet.add(r.projectName);
    });

    return {
      locations: Array.from(locationsSet).sort(),
      sources: Array.from(sourcesSet).sort(),
      projects: Array.from(projectsSet).sort()
    };
  }, [allData]);

  // Handle Zone filter check
  const applyZoneFilter = (dataArray: SheetRow[]) => {
    if (currentZone === 'west') {
      return dataArray.filter(row => ZONE_LOCATIONS.west.some(zoneKey =>
        row.location && row.location.toLowerCase().includes(zoneKey.toLowerCase())
      ));
    }
    if (currentZone === 'north') {
      return dataArray.filter(row => ZONE_LOCATIONS.north.some(zoneKey =>
        row.location && row.location.toLowerCase().includes(zoneKey.toLowerCase())
      ));
    }
    return dataArray;
  };

  // Final filtered data for metrics, lists, and graphs
  const filteredData = useMemo(() => {
    if (allData.length === 0) return [];
    let out = [...allData];

    // Filter by dates
    if (startDateStr || endDateStr) {
      let parsedStart = startDateStr ? new Date(startDateStr) : null;
      if (parsedStart) parsedStart.setHours(0, 0, 0, 0);

      let parsedEnd = endDateStr ? new Date(endDateStr) : null;
      if (parsedEnd) parsedEnd.setHours(23, 59, 59, 999);

      out = out.filter(r => {
        let d = parseFlexibleDate(r.timestamp);
        if (!d) return false;
        let day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (parsedStart && day < parsedStart) return false;
        if (parsedEnd && day > parsedEnd) return false;
        return true;
      });
    }

    // Dropdown Set Filters
    if (selectedLocations.size > 0) {
      out = out.filter(r => selectedLocations.has(r.location));
    }
    if (selectedSources.size > 0) {
      out = out.filter(r => selectedSources.has(r.source));
    }
    if (selectedProjects.size > 0) {
      out = out.filter(r => selectedProjects.has(r.projectName));
    }

    // Slider Zone Pune Filter
    out = applyZoneFilter(out);

    return out;
  }, [allData, startDateStr, endDateStr, selectedLocations, selectedSources, selectedProjects, currentZone]);

  // Aggregate stats info
  const metricsAggregates = useMemo(() => {
    const projectMap = new Map<string, { count: number; location: string }>();
    const uniqueLocs = new Set<string>();
    const uniqueSrcs = new Set<string>();

    filteredData.forEach(r => {
      if (!r.projectName) return;
      if (!projectMap.has(r.projectName)) {
        projectMap.set(r.projectName, { count: 0, location: r.location || 'Unknown' });
      }
      projectMap.get(r.projectName)!.count++;
      if (r.location) uniqueLocs.add(r.location);
      if (r.source) uniqueSrcs.add(r.source);
    });

    const sortedProjects = Array.from(projectMap.entries()).sort((a, b) => b[1].count - a[1].count);

    return {
      totalLeads: filteredData.length,
      projectsCount: projectMap.size,
      locationsCount: uniqueLocs.size,
      sourcesCount: uniqueSrcs.size,
      projectList: sortedProjects
    };
  }, [filteredData]);

  // Draw or Redraw premium charts when filteredData or theme changes
  useEffect(() => {
    if (filteredData.length === 0) {
      // Clear charts if no data
      if (timeseriesChartInstance.current) { timeseriesChartInstance.current.destroy(); timeseriesChartInstance.current = null; }
      if (locationChartInstance.current) { locationChartInstance.current.destroy(); locationChartInstance.current = null; }
      if (sourcesChartInstance.current) { sourcesChartInstance.current.destroy(); sourcesChartInstance.current = null; }
      return;
    }

    const isDark = theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#cbd5e1' : '#151f32';
    const accentBlue = '#3b82f6';
    const accentPurple = '#8b5cf6';

    // ---------------------------------
    // 1. Line Chart: Timeseries count trend
    // ---------------------------------
    if (timeseriesCanvasRef.current) {
      const dailyCounts: { [key: string]: number } = {};
      filteredData.forEach(r => {
        const d = parseFlexibleDate(r.timestamp);
        if (d) {
          const yr = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          const key = `${yr}-${mo}-${dy}`;
          dailyCounts[key] = (dailyCounts[key] || 0) + 1;
        }
      });

      const sortedDates = Object.keys(dailyCounts).sort();
      const tsLabels = sortedDates.map(dateStr => {
        const [yr, mo, dy] = dateStr.split('-');
        return `${dy}/${mo}/${yr}`;
      });
      const tsValues = sortedDates.map(key => dailyCounts[key]);

      const ctxHandler = timeseriesCanvasRef.current.getContext('2d');
      if (ctxHandler) {
        if (timeseriesChartInstance.current) {
          timeseriesChartInstance.current.destroy();
        }

        const gradientFill = ctxHandler.createLinearGradient(0, 0, 0, 240);
        gradientFill.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
        gradientFill.addColorStop(1, 'rgba(59, 130, 246, 0.01)');

        timeseriesChartInstance.current = new Chart(ctxHandler, {
          type: 'line',
          data: {
            labels: tsLabels,
            datasets: [{
              label: 'Total Leads',
              data: tsValues,
              borderColor: accentBlue,
              borderWidth: 2.5,
              backgroundColor: gradientFill,
              fill: true,
              tension: 0.35,
              pointBackgroundColor: accentBlue,
              pointBorderColor: isDark ? '#0b1329' : '#ffffff',
              pointBorderWidth: 1.5,
              pointRadius: tsValues.length > 50 ? 2 : 4,
              pointHoverRadius: 6,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: isDark ? '#111827' : '#ffffff',
                titleColor: isDark ? '#ffffff' : '#0f172a',
                bodyColor: isDark ? '#cbd5e1' : '#334155',
                borderColor: isDark ? '#1e293b' : '#cbd5e1',
                borderWidth: 1,
                padding: 10,
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: textColor, font: { size: 10, family: 'inherit', weight: 'bold' }, autoSkip: true, maxTicksLimit: 12 }
              },
              y: {
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: { color: textColor, font: { size: 10, family: 'JetBrains Mono', weight: 'bold' }, maxTicksLimit: 5 }
              }
            }
          }
        });
      }
    }

    // ---------------------------------
    // 2. Bar Chart: Location list (Top 10)
    // ---------------------------------
    if (locationCanvasRef.current) {
      const locCounts: { [key: string]: number } = {};
      filteredData.forEach(r => {
        const loc = r.location || 'Unknown';
        locCounts[loc] = (locCounts[loc] || 0) + 1;
      });
      const sortedLocs = Object.entries(locCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const locLabels = sortedLocs.map(e => e[0]);
      const locValues = sortedLocs.map(e => e[1]);

      const ctxHandler = locationCanvasRef.current.getContext('2d');
      if (ctxHandler) {
        if (locationChartInstance.current) {
          locationChartInstance.current.destroy();
        }

        const gradientBar = ctxHandler.createLinearGradient(0, 0, 0, 240);
        gradientBar.addColorStop(0, '#8b5cf6');
        gradientBar.addColorStop(1, '#3b82f6');

        locationChartInstance.current = new Chart(ctxHandler, {
          type: 'bar',
          data: {
            labels: locLabels,
            datasets: [{
              label: 'Leads',
              data: locValues,
              backgroundColor: gradientBar,
              borderRadius: 5,
              barPercentage: 0.5,
              categoryPercentage: 0.7
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: isDark ? '#111827' : '#ffffff',
                titleColor: isDark ? '#ffffff' : '#0f172a',
                bodyColor: isDark ? '#cbd5e1' : '#334155',
                borderColor: isDark ? '#1e293b' : '#cbd5e1',
                borderWidth: 1,
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: textColor, font: { size: 10, weight: 'bold' }, autoSkip: true, maxRotation: 30 }
              },
              y: {
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: { color: textColor, font: { size: 10, family: 'JetBrains Mono', weight: 'bold' }, maxTicksLimit: 5 }
              }
            }
          }
        });
      }
    }

    // ---------------------------------
    // 3. Doughnut Chart: Sources distribution
    // ---------------------------------
    if (sourcesCanvasRef.current) {
      const srcCounts: { [key: string]: number } = {};
      filteredData.forEach(r => {
        const src = r.source || 'Direct/Unknown';
        srcCounts[src] = (srcCounts[src] || 0) + 1;
      });
      const sortedSrcs = Object.entries(srcCounts).sort((a, b) => b[1] - a[1]);
      const srcLabels = sortedSrcs.map(e => e[0]);
      const srcValues = sortedSrcs.map(e => e[1]);

      const ctxHandler = sourcesCanvasRef.current.getContext('2d');
      if (ctxHandler) {
        if (sourcesChartInstance.current) {
          sourcesChartInstance.current.destroy();
        }

        const baseColors = [
          '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
          '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f97316'
        ];
        const doughnutColors = srcLabels.map((_, i) => baseColors[i % baseColors.length]);

        // Custom internal plugin to draw totals in center
        const centerLeadTextPlugin = {
          id: 'centerLeadTextPlugin',
          beforeDraw: (chart: any) => {
            const { ctx, chartArea: { left, top, width, height } } = chart;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Subtitle
            ctx.font = '600 10px sans-serif';
            ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
            ctx.fillText('LEADS TOTAL', left + width / 2, top + height / 2 - 12);
            
            // Number
            const total = chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
            ctx.font = 'bold 22px "JetBrains Mono", sans-serif';
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
            ctx.fillText(total.toLocaleString(), left + width / 2, top + height / 2 + 10);
            ctx.restore();
          }
        };

        sourcesChartInstance.current = new Chart(ctxHandler, {
          type: 'doughnut',
          plugins: [centerLeadTextPlugin],
          data: {
            labels: srcLabels,
            datasets: [{
              data: srcValues,
              backgroundColor: doughnutColors,
              borderColor: isDark ? '#090f1c' : '#ffffff',
              borderWidth: 2,
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: isDark ? '#cbd5e1' : '#334155',
                  boxWidth: 8,
                  padding: 8,
                  font: { size: 10, weight: 'bold' }
                }
              },
              tooltip: {
                backgroundColor: isDark ? '#111827' : '#ffffff',
                titleColor: isDark ? '#ffffff' : '#0f172a',
                bodyColor: isDark ? '#cbd5e1' : '#334155',
                borderColor: isDark ? '#1e293b' : '#cbd5e1',
                borderWidth: 1,
                callbacks: {
                  label: function(context) {
                    const val = context.parsed;
                    const tot = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                    const percentage = Math.round((val / tot) * 100);
                    return ` ${context.label}: ${val} (${percentage}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }
  }, [filteredData, theme]);

  // Handle Multi-Select filter utility functions
  const handleToggleOption = (type: 'location' | 'source' | 'project', optionValue: string) => {
    if (type === 'location') {
      const updated = new Set(selectedLocations);
      if (updated.has(optionValue)) updated.delete(optionValue);
      else updated.add(optionValue);
      setSelectedLocations(updated);
    } else if (type === 'source') {
      const updated = new Set(selectedSources);
      if (updated.has(optionValue)) updated.delete(optionValue);
      else updated.add(optionValue);
      setSelectedSources(updated);
    } else {
      const updated = new Set(selectedProjects);
      if (updated.has(optionValue)) updated.delete(optionValue);
      else updated.add(optionValue);
      setSelectedProjects(updated);
    }
  };

  const handleSelectAll = (type: 'location' | 'source' | 'project') => {
    if (type === 'location') {
      setSelectedLocations(new Set(uniqueOptionLists.locations));
    } else if (type === 'source') {
      setSelectedSources(new Set(uniqueOptionLists.sources));
    } else {
      setSelectedProjects(new Set(uniqueOptionLists.projects));
    }
  };

  const handleClearAll = (type: 'location' | 'source' | 'project') => {
    if (type === 'location') {
      setSelectedLocations(new Set());
    } else if (type === 'source') {
      setSelectedSources(new Set());
    } else {
      setSelectedProjects(new Set());
    }
  };

  const resetAllFilters = () => {
    setStartDateStr('');
    setEndDateStr('');
    setSelectedLocations(new Set());
    setSelectedSources(new Set());
    setSelectedProjects(new Set());
    setCurrentZone('mid');
  };

  // Export filtered items to CSV
  const exportDataToCSV = () => {
    if (metricsAggregates.projectList.length === 0) {
      alert("No data available to export under active filters.");
      return;
    }

    const headers = ["Project Name", "Location", "Lead Count"];
    
    // Safely wrap text containing special character/commas
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [
      headers.join(",")
    ];

    metricsAggregates.projectList.forEach(([name, data]) => {
      rows.push([
        escapeCSV(name),
        escapeCSV(data.location),
        escapeCSV(data.count)
      ].join(","));
    });

    const csvContent = "\uFEFF" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    link.setAttribute("download", `AssetScout_Leads_Report_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        (projectRef.current && projectRef.current.contains(target)) ||
        (locationRef.current && locationRef.current.contains(target)) ||
        (sourceRef.current && sourceRef.current.contains(target))
      ) {
        return; // Clicked inside one of the dropdown areas, so retain open states
      }
      setShowLocationDropdown(false);
      setShowSourceDropdown(false);
      setShowProjectDropdown(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Modal grouping details
  const modalData = useMemo(() => {
    if (!selectedProjectForModal) return null;
    const leads = filteredData.filter(r => r.projectName === selectedProjectForModal);
    if (!leads.length) return null;

    const srcMap = new Map<string, string[]>();
    leads.forEach(r => {
      const src = r.source || 'Unknown Source';
      if (!srcMap.has(src)) srcMap.set(src, []);
      srcMap.get(src)!.push(r.timestamp);
    });

    const sortedSources = Array.from(srcMap.entries()).sort((a, b) => b[1].length - a[1].length);
    const location = leads[0]?.location || 'Unknown';

    return {
      projectName: selectedProjectForModal,
      location,
      totalCount: leads.length,
      groupedSources: sortedSources
    };
  }, [selectedProjectForModal, filteredData]);

  // Filtered dropdown lists based on nested search terms
  const filteredLocationOptions = uniqueOptionLists.locations.filter(v => 
    v.toLowerCase().includes(locationSearch.toLowerCase())
  );
  const filteredSourceOptions = uniqueOptionLists.sources.filter(v => 
    v.toLowerCase().includes(sourceSearch.toLowerCase())
  );
  const filteredProjectOptions = uniqueOptionLists.projects.filter(v => 
    v.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex gap-2.5 select-none animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Google Sheets Feed Error</p>
            <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* FILTER PANEL ROW / ZONE SELECTOR */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl shadow-xs transition-colors space-y-2.5">
        
        <div className="flex flex-row flex-wrap items-end gap-3 select-none pb-1">
          
          {/* Start Date */}
          <div className="flex flex-col gap-1 min-w-[105px] md:min-w-[115px] flex-1">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">START DATE</span>
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="w-full text-xs font-semibold p-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 h-[38px]"
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1 min-w-[105px] md:min-w-[115px] flex-1">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">END DATE</span>
            <input
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="w-full text-xs font-semibold p-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 h-[38px]"
            />
          </div>

          {/* Project Choice */}
          <div ref={projectRef} className="flex flex-col gap-1 min-w-[110px] md:min-w-[125px] flex-1 relative">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">Project filter</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowProjectDropdown(!showProjectDropdown); setShowLocationDropdown(false); setShowSourceDropdown(false); }}
              className="w-full text-xs text-left p-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 flex items-center justify-between cursor-pointer h-[38px]"
            >
              <span className="truncate font-medium">
                {selectedProjects.size === 0 ? 'All' : selectedProjects.size === 1 ? `${[...selectedProjects][0]}` : `${selectedProjects.size} Chosen`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-450 shrink-0" />
            </button>

            {showProjectDropdown && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-[100%] left-0 z-40 mt-1.5 w-full min-w-[220px] bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2.5 space-y-2 animate-fadeIn"
              >
                <input
                  type="text"
                  placeholder="Search project..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full p-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-medium"
                />
                <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1">
                  {filteredProjectOptions.length === 0 ? (
                    <div className="text-[11px] text-center text-slate-400 dark:text-slate-550 py-2">No matching projects</div>
                  ) : (
                    filteredProjectOptions.map(p => (
                      <label key={p} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer rounded-lg text-xs font-semibold select-none">
                        <input
                          type="checkbox"
                          checked={selectedProjects.has(p)}
                          onChange={() => handleToggleOption('project', p)}
                          className="rounded text-indigo-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">{p}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex border-t border-slate-100 dark:border-slate-800/60 pt-2 gap-2 text-[10.5px] font-bold">
                  <button onClick={() => handleSelectAll('project')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Select All</button>
                  <button onClick={() => handleClearAll('project')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Clear All</button>
                </div>
              </div>
            )}
          </div>

          {/* Location Choice */}
          <div ref={locationRef} className="flex flex-col gap-1 min-w-[110px] md:min-w-[125px] flex-1 relative">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">Location filter</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowLocationDropdown(!showLocationDropdown); setShowProjectDropdown(false); setShowSourceDropdown(false); }}
              className="w-full text-xs text-left p-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 flex items-center justify-between cursor-pointer h-[38px]"
            >
              <span className="truncate font-medium">
                {selectedLocations.size === 0 ? 'All' : selectedLocations.size === 1 ? `${[...selectedLocations][0]}` : `${selectedLocations.size} Chosen`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-450 shrink-0" />
            </button>

            {showLocationDropdown && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-[100%] left-0 sm:right-0 sm:left-auto z-40 mt-1.5 w-full min-w-[220px] bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2.5 space-y-2 animate-fadeIn"
              >
                <input
                  type="text"
                  placeholder="Search region..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="w-full p-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-medium"
                />
                <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 font-medium">
                  {filteredLocationOptions.length === 0 ? (
                    <div className="text-[11px] text-center text-slate-400 dark:text-slate-550 py-2">No matching regions</div>
                  ) : (
                    filteredLocationOptions.map(l => (
                      <label key={l} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer rounded-lg text-xs font-semibold select-none">
                        <input
                          type="checkbox"
                          checked={selectedLocations.has(l)}
                          onChange={() => handleToggleOption('location', l)}
                          className="rounded text-indigo-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">{l}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex border-t border-slate-100 dark:border-slate-800/60 pt-2 gap-2 text-[10.5px] font-bold">
                  <button onClick={() => handleSelectAll('location')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Select All</button>
                  <button onClick={() => handleClearAll('location')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Clear All</button>
                </div>
              </div>
            )}
          </div>

          {/* Source Choice */}
          <div ref={sourceRef} className="flex flex-col gap-1 min-w-[110px] md:min-w-[125px] flex-1 relative">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">Source filter</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowSourceDropdown(!showSourceDropdown); setShowLocationDropdown(false); setShowProjectDropdown(false); }}
              className="w-full text-xs text-left p-2 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 flex items-center justify-between cursor-pointer h-[38px]"
            >
              <span className="truncate font-medium">
                {selectedSources.size === 0 ? 'All' : selectedSources.size === 1 ? `${[...selectedSources][0]}` : `${selectedSources.size} Chosen`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-450 shrink-0" />
            </button>

            {showSourceDropdown && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute top-[100%] left-0 md:right-0 md:left-auto z-40 mt-1.5 w-full min-w-[220px] bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2.5 space-y-2 animate-fadeIn"
              >
                <input
                  type="text"
                  placeholder="Search source..."
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  className="w-full p-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-medium"
                />
                <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 font-medium">
                  {filteredSourceOptions.length === 0 ? (
                    <div className="text-[11px] text-center text-slate-400 dark:text-slate-550 py-2">No matching sources</div>
                  ) : (
                    filteredSourceOptions.map(s => (
                      <label key={s} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer rounded-lg text-xs font-semibold select-none">
                        <input
                          type="checkbox"
                          checked={selectedSources.has(s)}
                          onChange={() => handleToggleOption('source', s)}
                          className="rounded text-indigo-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">{s}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex border-t border-slate-100 dark:border-slate-800/60 pt-2 gap-2 text-[10.5px] font-bold">
                  <button onClick={() => handleSelectAll('source')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Select All</button>
                  <button onClick={() => handleClearAll('source')} className="flex-1 p-1 bg-slate-55 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded">Clear All</button>
                </div>
              </div>
            )}
          </div>

          {/* Slider Zone Pune Filter */}
          <div className="flex flex-col gap-1 min-w-[145px] flex-1">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 tracking-wider uppercase truncate">ZONE PUNE</span>
            <div className="relative bg-slate-100/80 dark:bg-slate-950/40 p-1 border border-slate-200 dark:border-slate-850 rounded-xl flex items-center select-none h-[38px] w-full">
              <div 
                className={`absolute w-[31%] h-[calc(100%-8px)] rounded-lg bg-indigo-600 shadow-xs transition-all duration-200 ease-out`}
                style={{
                  left: currentZone === 'west' ? '4px' : currentZone === 'mid' ? '34.5%' : '65.5%'
                }}
              />
              <button
                type="button"
                onClick={() => setCurrentZone('west')}
                className={`flex-1 text-[11px] font-bold text-center py-1 rounded-lg z-10 transition-colors uppercase cursor-pointer ${currentZone === 'west' ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`}
              >
                West
              </button>
              <button
                type="button"
                onClick={() => setCurrentZone('mid')}
                className={`flex-1 text-[11px] font-bold text-center py-1 rounded-lg z-10 transition-colors uppercase cursor-pointer ${currentZone === 'mid' ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCurrentZone('north')}
                className={`flex-1 text-[11px] font-bold text-center py-1 rounded-lg z-10 transition-colors uppercase cursor-pointer ${currentZone === 'north' ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`}
              >
                North
              </button>
            </div>
          </div>

          {/* Reset All */}
          <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
            <span className="text-[10px] h-[15px] hidden sm:block"></span>
            <button
              onClick={resetAllFilters}
              className="w-full sm:w-auto p-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-850 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-50/20 dark:bg-slate-905/30 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer h-[38px]"
            >
              Reset All
            </button>
          </div>

          {/* Refresh Sheet */}
          <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
            <span className="text-[10px] h-[15px] hidden sm:block"></span>
            <button
              onClick={fetchSheetData}
              disabled={isLoading}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 p-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-850 text-xs font-semibold bg-slate-50/20 dark:bg-slate-905/30 hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 disabled:opacity-50 cursor-pointer h-[38px] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>
          </div>

          {/* Export */}
          <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
            <span className="text-[10px] h-[15px] hidden sm:block"></span>
            <button
              onClick={() => setShowExportModal(true)}
              className="w-full sm:w-auto p-2 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/15 transition-all cursor-pointer h-[38px] hover:scale-[1.01]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

        </div>

        {/* Bottom helper info line */}
        <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-semibold font-mono tracking-wide uppercase pt-1.5 border-t border-slate-100 dark:border-slate-850/60 no-print">
          <Info className="w-3 h-3 text-indigo-505 dark:text-indigo-400 shrink-0" />
          <span>Pune bounds: West ({ZONE_LOCATIONS.west.length} sectors) • North ({ZONE_LOCATIONS.north.length} sectors)</span>
        </div>

      </div>

      {/* METRICS GRID - 4 DECORATED CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Total Leads */}
        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-blue-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs relative overflow-hidden transition-all hover:translate-y-[-2px]">
          <span className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider block">Total Leads</span>
          <div className="text-3xl font-extrabold font-mono text-blue-500 mt-1">{metricsAggregates.totalLeads.toLocaleString()}</div>
        </div>

        {/* Unique Projects */}
        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-purple-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs relative overflow-hidden transition-all hover:translate-y-[-2px]">
          <span className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider block">Total Projects</span>
          <div className="text-3xl font-extrabold font-mono text-purple-500 mt-1">{metricsAggregates.projectsCount}</div>
        </div>

        {/* Region Sectors */}
        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-emerald-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs relative overflow-hidden transition-all hover:translate-y-[-2px]">
          <span className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider block">Total Locations</span>
          <div className="text-3xl font-extrabold font-mono text-emerald-500 mt-1">{metricsAggregates.locationsCount}</div>
        </div>

        {/* Channels */}
        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-amber-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs relative overflow-hidden transition-all hover:translate-y-[-2px]">
          <span className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider block">Total Sources</span>
          <div className="text-3xl font-extrabold font-mono text-amber-500 mt-1">{metricsAggregates.sourcesCount}</div>
        </div>

      </div>

      {allData.length === 0 && !isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="text-slate-800 dark:text-slate-200 font-bold mt-3">Google Sheet Empty or Disconnected</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Please make sure that the spreadsheet is shared with active read permissions or refresh data to fetch again.
          </p>
        </div>
      ) : (
        <>
          {/* CHARTS CONTAINER GRID */}
          <div className="grid grid-cols-1 gap-6">
            
            {/* 1. Timeseries count line trend */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs transition-colors">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-5">
                <h3 className="text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest">
                  Leads Count Trend (Timeseries)
                </h3>
                <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-1 px-2.5 rounded-lg select-all">
                  {startDateStr || endDateStr ? `Filtered frame` : 'All historic cumulative trends'}
                </span>
              </div>
              <div className="h-[280px] w-full relative">
                <canvas ref={timeseriesCanvasRef} />
              </div>
            </div>

            {/* 2 & 3: Dual Column charts for Location Bar and Sources Doughnut */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Locations bar top 10 */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs transition-colors">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-5">
                  <h3 className="text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest">
                    Leads by Location (Top 10)
                  </h3>
                </div>
                <div className="h-[250px] w-full relative">
                  <canvas ref={locationCanvasRef} />
                </div>
              </div>

              {/* Sources distribution Doughnut */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs transition-colors">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-5">
                  <h3 className="text-xs font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest">
                    Leads Distribution
                  </h3>
                </div>
                <div className="h-[250px] w-full relative">
                  <canvas ref={sourcesCanvasRef} />
                </div>
              </div>

            </div>

          </div>

          {/* ACTIVE PROJECTS LIST TABLE SECTION */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-colors">
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-900/40 text-[10px] text-slate-450 dark:text-slate-500 uppercase tracking-widest font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 pl-6 w-[45%]">Project Name</th>
                    <th className="p-4 text-center w-[30%]">Sector Region Location</th>
                    <th className="p-4 text-right pr-6 w-[25%] text-slate-600 dark:text-slate-350 font-bold">Total Leads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs">
                  {metricsAggregates.projectList.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-10 text-center font-mono text-slate-400">
                        No projects correspond to active filters.
                      </td>
                    </tr>
                  ) : (
                    metricsAggregates.projectList.map(([projectName, data]) => (
                      <tr
                        key={projectName}
                        onClick={() => setSelectedProjectForModal(projectName)}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer group"
                      >
                        <td className="p-4 pl-6">
                          <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {projectName}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center p-1 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-50 dark:bg-[#1a2333] border border-slate-200/50 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                            {data.location || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-4 text-right pr-6">
                          <span className="font-extrabold font-mono text-slate-900 dark:text-white">
                            {data.count.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </>
      )}

      {/* FOOTER SYNC METADATA */}
      <div className="text-center font-mono text-[10px] text-slate-400 dark:text-slate-550 pt-2 border-t border-slate-100 dark:border-slate-850/60 pb-4">
        Last Pull: {new Date().toLocaleTimeString()} | G-Cloud sheets feed connected | API OK
      </div>

      {/* LEAD SOURCE DETAILS MODAL overlay */}
      {selectedProjectForModal && modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedProjectForModal(null)}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs transition-opacity"
          />

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xl overflow-hidden animate-zoomIn flex flex-col max-h-[82vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-indigo-600 text-white">
              <div>
                <h3 className="font-bold text-sm tracking-tight">{modalData.projectName}</h3>
                <p className="text-[11px] opacity-80 font-semibold mt-0.5 font-sans leading-none">
                  {modalData.location}
                </p>
              </div>
              <button
                onClick={() => setSelectedProjectForModal(null)}
                className="p-1 px-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Timestamps listing source-by-source */}
            <div className="p-5 overflow-y-auto space-y-5 divide-y divide-slate-100 dark:divide-slate-800/50">
              
              {modalData.groupedSources.map(([sourceName, timestamps], idx) => {
                const sortedTimestamps = [...timestamps].sort((a, b) => {
                  let da = parseFlexibleDate(a);
                  let db = parseFlexibleDate(b);
                  return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
                });

                return (
                  <div key={sourceName} className={`${idx > 0 ? 'pt-4' : ''} space-y-2.5`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-1 px-3 rounded-lg capitalize">
                        {sourceName}
                      </span>
                      <span className="text-[11px] font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                        {timestamps.length} Total Leads
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1.5">
                      {sortedTimestamps.map((ts, tIdx) => (
                        <div
                          key={tIdx}
                          className="font-mono text-[10.5px] border-b border-dashed border-slate-100 dark:border-slate-800/40 p-1 text-slate-500 dark:text-slate-400 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                          <span>{formatDisplayDate(ts)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Bottom aggregate indicator */}
            <div className="p-4 bg-slate-50 dark:bg-[#1a2333]/30 border-t border-slate-100 dark:border-slate-800/60 flex justify-between items-center font-mono text-[10.5px] text-slate-450 dark:text-slate-500">
              <span>Classified channels: {modalData.groupedSources.length}</span>
              <span className="font-extrabold">Total: {modalData.totalCount} leads</span>
            </div>

          </div>

        </div>
      )}

      {/* CUSTOM LEADS EXPORTS POPUP */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-[320px] w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 text-center animate-scale-up">
            
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#667085] dark:text-slate-400">Export</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-1">
              <button
                onClick={() => {
                  exportDataToCSV();
                  setShowExportModal(false);
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 cursor-pointer hover:scale-[1.01]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel</span>
              </button>

              <button
                onClick={() => {
                  setShowExportModal(false);
                  setTimeout(() => {
                    window.print();
                  }, 250);
                }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/10 cursor-pointer hover:scale-[1.01]"
              >
                <FileText className="w-4 h-4" />
                <span>PDF</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
