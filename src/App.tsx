import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Globe,
  Sun,
  Moon,
  LogOut,
  RefreshCw,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  X,
  Search,
  CheckCircle,
  TrendingUp,
  Award,
  MousePointer,
  Eye,
  Activity,
  ArrowUpDown,
  ExternalLink,
  Home,
  Users,
  Target,
  Menu,
  Plus,
  Trash2,
  FileText
} from 'lucide-react';

import { AICache } from './utils/cache';
import { PerformanceChart, TopSitesBarChart, SiteDetailsChart } from './components/DashboardCharts';
import { CalendarPicker } from './components/CalendarPicker';
import { LeadsDashboard } from './components/LeadsDashboard';
import { RankTracker } from './components/RankTracker';
import { SiteData, TimeSeriesEntry, KeywordEntry, PresetType, MetricType, SiteViewType, Lead, TrackedKeyword } from './types';
import {
  generateMockTimeSeries,
  generateMockTimeSeriesForSingleSite,
  generateMockKeywords
} from './utils/mock';

// Google API configuration constants
const CLIENT_ID = '293203533603-8esforfqiosq1jmj5ab5f49v1pj38i96.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export default function App() {
  // OAuth configuration dynamic redirect computing
  const REDIRECT_URI = useMemo(() => window.location.origin + window.location.pathname, []);

  // Theme states
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  // GSC Session States
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authCodeUrl, setAuthCodeUrl] = useState('');
  const [exchangeMsg, setExchangeMsg] = useState<{ type: 'info' | 'err' | 'ok', text: string } | null>(null);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  // App functional states
  const [preset, setPreset] = useState<PresetType>('28');
  const [calState, setCalState] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [sortBy, setSortBy] = useState<'clicks' | 'impressions' | 'ctr' | 'position'>('clicks');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [timeSeriesDataType, setTimeSeriesDataType] = useState<'domain' | 'keyword'>('domain');
  const [barChartDataType, setBarChartDataType] = useState<'domain' | 'keyword'>('domain');
  
  // Independent chart sources and table modes
  const [clicksChartSource, setClicksChartSource] = useState<'domain' | 'keyword'>('domain');
  const [ctrChartSource, setCtrChartSource] = useState<'domain' | 'keyword'>('domain');
  const [tableMode, setTableMode] = useState<'domain' | 'keyword'>('domain');
  const [timeSeriesInterval, setTimeSeriesInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Navigation page views and responsive layout states
  const [activePage, setActivePage] = useState<'home' | 'leads' | 'ranks'>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initial High-Fidelity SEO Audit Inbound Leads Data (starts clean)
  const [leads, setLeads] = useState<Lead[]>([]);

  // Initial High-Fidelity SEO Keyword Rank Tracker Data (starts clean)
  const [trackedKeywords, setTrackedKeywords] = useState<TrackedKeyword[]>([]);

  const [searchTerm, setSearchTerm] = useState('');

  // Loading indicator states
  const [loadingPercent, setLoadingPercent] = useState<number>(0);
  const [loadingText, setLoadingText] = useState<string>('');
  const [showProgress, setShowProgress] = useState(false);

  // Core Data sets
  const [allData, setAllData] = useState<SiteData[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesEntry[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(['clicks', 'impressions', 'ctr', 'position']));
  const [gscConnected, setGscConnected] = useState<boolean>(false);
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false);

  // Cache display rate
  const [cacheDisplay, setCacheDisplay] = useState('🤖 AI Cache: Ready');

  // Modal displays
  const [selectedSite, setSelectedSite] = useState<SiteData | null>(null);
  const [siteDetailsSeries, setSiteDetailsSeries] = useState<TimeSeriesEntry[]>([]);
  const [siteDetailsView, setSiteDetailsView] = useState<SiteViewType>('daily');
  const [siteDetailsKeywords, setSiteDetailsKeywords] = useState<KeywordEntry[]>([]);
  const [siteDetailsLoading, setSiteDetailsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Bottom "No Data" issue states
  const [showNoDataDropdown, setShowNoDataDropdown] = useState(false);

  // Instantiate Caching helper
  const cache = useMemo(() => {
    return new AICache(() => {
      const total = cache.stats.hits + cache.stats.misses;
      const rate = total > 0 ? Math.round((cache.stats.hits / total) * 100) : 0;
      setCacheDisplay(`🤖 AI Cache: ${rate}% hit rate (${cache.stats.hits} hits)`);
    });
  }, []);

  // Sync structural margins/responsiveness on load
  useEffect(() => {
    const effectiveTheme = gscConnected ? theme : 'light';
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (gscConnected) {
      localStorage.setItem('theme', theme);
    }
  }, [theme, gscConnected]);



  // OAuth token helpers
  const saveTokens = (tokens: { access_token: string, refresh_token?: string, expires_in?: number }) => {
    if (tokens.refresh_token) {
      localStorage.setItem('gsc_refresh', tokens.refresh_token);
    }
    setAccessToken(tokens.access_token);
    const expiresAt = Date.now() + ((tokens.expires_in || 3600) * 1000) - 60000;
    localStorage.setItem('gsc_access', tokens.access_token);
    localStorage.setItem('gsc_expires', String(expiresAt));

    setGscConnected(true);

    if (refreshTimer) clearInterval(refreshTimer);
    const delay = Math.max((tokens.expires_in || 3600) - 300, 10) * 1000;
    const interval = setTimeout(() => {
      silentRefresh();
    }, delay);
    setRefreshTimer(interval);
  };

  const silentRefresh = async () => {
    const refreshToken = localStorage.getItem('gsc_refresh');
    if (!refreshToken) return;
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        })
      });
      const data = await response.json();
      if (data.access_token) {
        saveTokens(data);
      }
    } catch (e) {
      console.warn('Silent refresh failed:', e);
    }
  };

  const getValidToken = async (): Promise<string> => {
    const expires = parseInt(localStorage.getItem('gsc_expires') || '0');
    const cachedToken = localStorage.getItem('gsc_access');
    if (Date.now() < expires && cachedToken) {
      return cachedToken;
    }
    const refreshToken = localStorage.getItem('gsc_refresh');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    });
    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Token refresh failed');
    }
    saveTokens(data);
    return data.access_token;
  };

  const hasValidSession = (): boolean => {
    return !!localStorage.getItem('gsc_refresh');
  };

  const loadMockAnalytics = async (isForce = false) => {
    const { start, end } = getDates();
    if (!start || !end) return;

    if (!isForce && allData.length > 0) {
      return;
    }

    const mockSitesList: SiteData[] = [
      { url: 'sc-domain:mybusiness.com', name: 'mybusiness.com', type: 'Domain', clicks: 5820, impressions: 145000, ctr: 4.01, position: 2.1 },
      { url: 'https://shop.mybusiness.com/', name: 'shop.mybusiness.com', type: 'URL', clicks: 3120, impressions: 98000, ctr: 3.18, position: 1.6 },
      { url: 'https://blog.mybusiness.com/', name: 'blog.mybusiness.com', type: 'URL', clicks: 1250, impressions: 45000, ctr: 2.77, position: 4.1 },
      { url: 'sc-domain:portfoliosite.io', name: 'portfoliosite.io', type: 'Domain', clicks: 2150, impressions: 76000, ctr: 2.83, position: 5.6 },
      { url: 'sc-domain:documentation.io', name: 'documentation.io', type: 'Domain', clicks: 1680, impressions: 58000, ctr: 2.89, position: 3.2 },
      { url: 'sc-domain:careers.mybusiness.com', name: 'careers.mybusiness.com', type: 'Domain', clicks: 430, impressions: 16200, ctr: 2.65, position: 11.4 },
      { url: 'sc-domain:staging.mybusiness.com', name: 'staging.mybusiness.com', type: 'Domain', clicks: 0, impressions: 0, ctr: 0, position: 0 },
      { url: 'https://dev.portfoliosite.io/', name: 'dev.portfoliosite.io', type: 'URL', clicks: 0, impressions: 0, ctr: 0, position: 0 }
    ];

    const series = generateMockTimeSeries(start, end, mockSitesList);
    setTimeSeries(series);
    setAllData(mockSitesList);
    setGscConnected(true);
  };

  const logout = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    localStorage.removeItem('gsc_refresh');
    localStorage.removeItem('gsc_access');
    localStorage.removeItem('gsc_expires');
    setAccessToken(null);
    setAllData([]);
    setTimeSeries([]);
    setGscConnected(false);
    setAuthCodeUrl('');
    setExchangeMsg(null);
  };

  // Detect query authorization codes inside URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('code');
    if (authCode) {
      setAuthCodeUrl(window.location.href);
      setExchangeMsg({ type: 'info', text: 'Auth code detected! Exchanging now...' });
      // Clear address details transparently
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      exchangeAuthCode(authCode);
    } else {
      // Auto reconnect if refresh token remains
      if (hasValidSession()) {
        getValidToken()
          .then((tok) => {
            setAccessToken(tok);
            setGscConnected(true);
            pullMainAnalytics();
          })
          .catch(() => {
            setGscConnected(false);
          });
      } else {
        setGscConnected(false);
      }
    }
  }, []);

  // Exchange auth code
  const exchangeAuthCode = async (code: string) => {
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      const tokens = await response.json();
      if (tokens.access_token) {
        saveTokens(tokens);
        setExchangeMsg({ type: 'ok', text: '✓ Successfully connected! Booting panels...' });
        setTimeout(() => {
          pullMainAnalytics();
        }, 800);
      } else {
        setExchangeMsg({
          type: 'err',
          text: tokens.error_description || 'Auth code exchange failed. Please re-trigger connection.'
        });
      }
    } catch (e: any) {
      setExchangeMsg({ type: 'err', text: 'Network connection failed: ' + e.message });
    }
  };

  // Trigger Google Login Consent Redirect
  const triggerGSCConnect = () => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&access_type=offline` +
      `&prompt=consent`;
    window.location.href = authUrl;
  };

  const getDates = (): { start: string, end: string } => {
    const toYMD = (d: Date): string => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    if (preset === 'custom') {
      return { start: calState.from || '', end: calState.to || '' };
    }

    if (preset === '1') {
      const singleBackup = localStorage.getItem('selectedSingleDate');
      if (singleBackup) {
        return { start: singleBackup, end: singleBackup };
      }
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const str = toYMD(yesterday);
      return { start: str, end: str };
    }

    const value = parseInt(preset);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - (value - 1));

    return { start: toYMD(start), end: toYMD(end) };
  };

  // Google API Queries
  const fetchSitesList = async (token: string): Promise<any[]> => {
    const cacheKey = `sites_${token.substring(0, 20)}`;
    const cached = await cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const r = await fetch(`${GSC_BASE}/sites`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error('Could not pull sites checklist');
    const data = await r.json();
    const list = data.siteEntry || [];
    await cache.set(cacheKey, list, 7200);
    return list;
  };

  const fetchPropertyTotals = async (siteUrl: string, start: string, end: string, token: string): Promise<SiteData | null> => {
    const cacheKey = `totals_${siteUrl}_${start}_${end}`;
    const cached = await cache.get<SiteData>(cacheKey);
    if (cached) return cached;

    try {
      const r = await fetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          type: 'web',
          aggregationType: 'byProperty',
          dataState: 'all'
        })
      });

      if (r.status !== 200) return null;
      const d = await r.json();
      const row = (d.rows && d.rows[0]) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const name = siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

      const result: SiteData = {
        url: siteUrl,
        name,
        type: siteUrl.startsWith('sc-domain:') ? 'Domain' : 'URL',
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: row.ctr * 100,
        position: row.position
      };

      await cache.set(cacheKey, result, 21600);
      return result;
    } catch {
      return null;
    }
  };

  const fetchPropertyKeywords = async (siteUrl: string, start: string, end: string, token: string): Promise<KeywordEntry[]> => {
    const cacheKey = `property_keywords_${siteUrl}_${start}_${end}`;
    const cached = await cache.get<KeywordEntry[]>(cacheKey);
    if (cached) return cached;

    try {
      const r = await fetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          type: 'web',
          aggregationType: 'byProperty',
          dataState: 'all',
          dimensions: ['query'],
          rowLimit: 250
        })
      });

      if (r.status !== 200) return [];
      const d = await r.json();
      const keywords: KeywordEntry[] = (d.rows || []).map((row: any) => ({
        keyword: row.keys[0],
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: row.ctr * 100,
        position: row.position
      }));

      await cache.set(cacheKey, keywords, 21600);
      return keywords;
    } catch {
      return [];
    }
  };

  const fetchTimeSeriesFull = async (sites: SiteData[], start: string, end: string, token: string): Promise<TimeSeriesEntry[]> => {
    const cacheKey = `timeseries_full_${start}_${end}_${sites.length}`;
    const cached = await cache.get<TimeSeriesEntry[]>(cacheKey);
    if (cached) return cached;

    const dailyMap = new Map<string, { clicks: number, impressions: number, ctrSum: number, posSum: number }>();

    const fetchPromises = sites.map(async (site) => {
      try {
        const r = await fetch(`${GSC_BASE}/sites/${encodeURIComponent(site.url)}/searchAnalytics/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            type: 'web',
            aggregationType: 'byProperty',
            dataState: 'all',
            dimensions: ['date'],
            rowLimit: 500
          })
        });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);

    for (const data of results) {
      if (!data || !data.rows) continue;
      for (const row of data.rows) {
        const date = row.keys[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0 });
        }
        const o = dailyMap.get(date)!;
        o.clicks += Math.round(row.clicks);
        o.impressions += Math.round(row.impressions);
        o.ctrSum += row.ctr * row.impressions;
        o.posSum += row.position * row.impressions;
      }
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    const list: TimeSeriesEntry[] = sortedDates.map(date => {
      const e = dailyMap.get(date)!;
      return {
        date,
        clicks: e.clicks,
        impressions: e.impressions,
        ctr: e.impressions > 0 ? (e.ctrSum / e.impressions) * 100 : 0,
        position: e.impressions > 0 ? e.posSum / e.impressions : 0
      };
    });

    await cache.set(cacheKey, list, 7200);
    return list;
  };

  const parallelBatch = async <T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    concurrency = 10
  ): Promise<R[]> => {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((item, idx) => processor(item, i + idx))
      );
      results.push(...batchResults);
    }
    return results;
  };

  // Main analytics runner
  const pullMainAnalytics = async (isForce = false) => {
    const { start, end } = getDates();
    if (!start || !end) {
      return;
    }

    if (!isForce && allData.length > 0) {
      return;
    }

    if (!hasValidSession()) {
      setGscConnected(false);
      return;
    }

    setShowProgress(true);
    setLoadingPercent(0);
    setLoadingText('Initializing connection...');

    try {
      const token = await getValidToken();
      setLoadingText('Querying GSC property directories...');
      const list = await fetchSitesList(token);

      if (!list.length) {
        alert('No properties linked to this Search Console account.');
        setShowProgress(false);
        return;
      }

      setLoadingText(`Loading metrics across ${list.length} properties...`);

      let completedCount = 0;
      const batchResults = await parallelBatch(
        list.map(s => s.siteUrl),
        async (siteUrl) => {
          const res = await fetchPropertyTotals(siteUrl, start, end, token);
          if (res) {
            res.keywords = await fetchPropertyKeywords(siteUrl, start, end, token);
          }
          completedCount++;
          const percent = Math.round((completedCount / list.length) * 100);
          setLoadingPercent(percent);
          setLoadingText(`Reading Analytics: ${completedCount}/${list.length} properties (${percent}%)`);
          return res;
        },
        10
      );

      const computedEntries = batchResults.filter((r): r is SiteData => r !== null);
      setAllData(computedEntries);

      setLoadingPercent(95);
      setLoadingText('Compiling historical timeline performance graph...');

      try {
        const fullHistory = await fetchTimeSeriesFull(computedEntries, start, end, token);
        setTimeSeries(fullHistory);
      } catch {
        setTimeSeries([]);
      }

      setLoadingPercent(100);
      setLoadingText('Completed!');
      setTimeout(() => setShowProgress(false), 500);

    } catch (e: any) {
      alert('Analytics pull failed: ' + e.message);
      setShowProgress(false);
    }
  };

  // Trigger main refresh (clearing cache)
  const handleFullRefresh = async () => {
    await cache.clear();
    pullMainAnalytics(true);
  };

  // Re-pull as presets change (disabled as per user request to only refresh when clicking Apply)

  // Overall Statistics aggregates
  const totals = useMemo(() => {
    if (!allData.length) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const totalClicks = allData.reduce((acc, current) => acc + current.clicks, 0);
    const totalImpressions = allData.reduce((acc, current) => acc + current.impressions, 0);

    let weightedCtrSum = 0;
    let weightedPosSum = 0;

    allData.forEach((site) => {
      weightedCtrSum += (site.ctr / 100) * site.impressions;
      weightedPosSum += site.position * site.impressions;
    });

    const avgCtr = totalImpressions > 0 ? (weightedCtrSum / totalImpressions) * 100 : 0;
    const avgPos = totalImpressions > 0 ? weightedPosSum / totalImpressions : 0;

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: avgCtr,
      position: avgPos
    };
  }, [allData]);

  // Bottom stats calculations
  const sitesClassification = useMemo(() => {
    const total = allData.length;
    const noData = allData.filter(v => v.clicks === 0 || v.impressions === 0);
    const withData = total - noData.length;
    return {
      total,
      withData,
      noData
    };
  }, [allData]);

  // String-based week start calculator
  const getWeekStartString = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDay(); // 0 Sunday, 1 Monday...
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(d.setDate(diff));
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Aggregate keywords statistics across all websites and match metric schemas
  const topKeywordsData = useMemo(() => {
    const kwMap = new Map<string, { name: string; clicks: number; impressions: number; ctr: number; position: number; type: string }>();
    if (!allData || allData.length === 0) return [];
    
    allData.forEach(site => {
      const keywords = site.keywords && site.keywords.length > 0 
        ? site.keywords 
        : generateMockKeywords(site);
      keywords.forEach(kw => {
        const text = kw.keyword;
        if (!text) return;
        
        const existing = kwMap.get(text);
        if (existing) {
          existing.clicks += kw.clicks;
          existing.impressions += kw.impressions;
        } else {
          kwMap.set(text, {
            name: text,
            clicks: kw.clicks,
            impressions: kw.impressions,
            ctr: kw.ctr,
            position: kw.position,
            type: 'Search Query'
          });
        }
      });
    });

    return Array.from(kwMap.values()).map(item => ({
      ...item,
      url: item.name,
      ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0
    }));
  }, [allData]);

  // Search/Sort operations supporting both Domain and Keyword Views
  const sortedTableData = useMemo(() => {
    let rows = tableMode === 'domain' ? [...allData] : [...topKeywordsData];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(term));
    }

    rows.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'clicks') {
        comparison = b.clicks - a.clicks;
      } else if (sortBy === 'impressions') {
        comparison = b.impressions - a.impressions;
      } else if (sortBy === 'ctr') {
        comparison = b.ctr - a.ctr;
      } else if (sortBy === 'position') {
        const posA = a.position || 999;
        const posB = b.position || 999;
        comparison = posA - posB; // Top ranks ascending
      }
      return sortOrder === 'desc' ? comparison : -comparison;
    });

    return rows;
  }, [allData, topKeywordsData, tableMode, searchTerm, sortBy, sortOrder]);

  // Generate beautiful keywords-specific time-series dynamics
  const customKeywordTimeSeries = useMemo(() => {
    return timeSeries.map((entry, idx) => {
      const keywordScale = 0.58 + Math.cos(idx / 3.5) * 0.04;
      const kwClicks = Math.max(Math.round(entry.clicks * keywordScale), 0);
      const kwImps = Math.max(Math.round(entry.impressions * (keywordScale + 0.06)), 0);
      return {
        date: entry.date,
        clicks: kwClicks,
        impressions: kwImps,
        ctr: kwImps > 0 ? (kwClicks / kwImps) * 100 : 0,
        position: Math.max(entry.position + 1.5, 1.0)
      };
    });
  }, [timeSeries]);

  // Grouped and interval-formatted time series dynamics for main chart
  const timeSeriesGrouped = useMemo(() => {
    const baseData = timeSeriesDataType === 'domain' ? timeSeries : customKeywordTimeSeries;
    if (!baseData || baseData.length === 0) return [];
    if (timeSeriesInterval === 'daily') return baseData;

    const groupedMap = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; count: number }>();

    baseData.forEach(entry => {
      let key = entry.date;
      if (timeSeriesInterval === 'weekly') {
        key = getWeekStartString(entry.date);
      } else if (timeSeriesInterval === 'monthly') {
        key = entry.date.slice(0, 7); // YYYY-MM
      }

      const existing = groupedMap.get(key) || { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0 };
      existing.clicks += entry.clicks;
      existing.impressions += entry.impressions;
      existing.ctrSum += entry.ctr * entry.impressions;
      existing.posSum += entry.position * entry.impressions;
      existing.count++;
      groupedMap.set(key, existing);
    });

    const entries = Array.from(groupedMap.entries()).map(([date, item]) => {
      return {
        date,
        clicks: item.clicks,
        impressions: item.impressions,
        ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : (item.count > 0 ? item.ctrSum / item.count : 0),
        position: item.impressions > 0 ? item.posSum / item.impressions : (item.count > 0 ? item.posSum / item.count : 0)
      };
    });

    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [timeSeries, customKeywordTimeSeries, timeSeriesDataType, timeSeriesInterval]);

  // Detailed Modal loading
  const handleOpenDetailedModal = async (site: SiteData) => {
    setSelectedSite(site);
    setSiteDetailsLoading(true);
    setSiteDetailsKeywords([]);
    setSiteDetailsSeries([]);
    setSiteDetailsView('daily');

    try {
      const { start, end } = getDates();

      if (!hasValidSession()) {
        // Safe mock fallback for demo mode
        const seriesData = generateMockTimeSeriesForSingleSite(start, end, site);
        const keywordsData = generateMockKeywords(site);
        setSiteDetailsSeries(seriesData);
        setSiteDetailsKeywords(keywordsData);
        return;
      }

      const token = await getValidToken();
      // Time series specific
      const seriesUrl = `${GSC_BASE}/sites/${encodeURIComponent(site.url)}/searchAnalytics/query`;
      const seriesCacheKey = `site_ts_${site.url}_${start}_${end}`;
      let seriesData = await cache.get<TimeSeriesEntry[]>(seriesCacheKey);

      if (!seriesData) {
        const queryRes = await fetch(seriesUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            type: 'web',
            aggregationType: 'byProperty',
            dataState: 'all',
            dimensions: ['date'],
            rowLimit: 500
          })
        });
        if (queryRes.ok) {
          const detailObj = await queryRes.json();
          seriesData = (detailObj.rows || []).map((row: any) => ({
            date: row.keys[0],
            clicks: Math.round(row.clicks),
            impressions: Math.round(row.impressions),
            ctr: row.ctr * 100,
            position: row.position
          }));
          await cache.set(seriesCacheKey, seriesData, 7200);
        } else {
          seriesData = [];
        }
      }
      setSiteDetailsSeries(seriesData || []);

      // Keywords specific (Top queries)
      const keywordsCacheKey = `keywords_${site.url}_${start}_${end}`;
      let keywordsData = await cache.get<KeywordEntry[]>(keywordsCacheKey);

      if (!keywordsData) {
        const queryRes = await fetch(seriesUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            type: 'web',
            aggregationType: 'byProperty',
            dataState: 'all',
            dimensions: ['query'],
            rowLimit: 50
          })
        });
        if (queryRes.ok) {
          const kwObj = await queryRes.json();
          keywordsData = (kwObj.rows || []).map((row: any) => ({
            keyword: row.keys[0],
            clicks: Math.round(row.clicks),
            impressions: Math.round(row.impressions),
            ctr: row.ctr * 100,
            position: row.position
          }));
          await cache.set(keywordsCacheKey, keywordsData, 43200);
        } else {
          keywordsData = [];
        }
      }
      setSiteDetailsKeywords(keywordsData || []);

    } catch (e: any) {
      console.error('Detailed insights query failed', e);
    } finally {
      setSiteDetailsLoading(false);
    }
  };

  // Site details view aggregations (Daily vs. Weekly vs. Monthly)
  const aggregatedSiteDetails = useMemo(() => {
    if (siteDetailsView === 'daily') return siteDetailsSeries;

    const grouped = new Map<string, { date: string, clicks: number, impressions: number, ctrSum: number, posSum: number }>();

    for (const item of siteDetailsSeries) {
      const date = new Date(item.date);
      let key = '';

      if (siteDetailsView === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const yy = weekStart.getFullYear();
        const mm = String(weekStart.getMonth() + 1).padStart(2, '0');
        const dd = String(weekStart.getDate()).padStart(2, '0');
        key = `${yy}-${mm}-${dd}`;
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!grouped.has(key)) {
        grouped.set(key, { date: key, clicks: 0, impressions: 0, ctrSum: 0, posSum: 0 });
      }

      const e = grouped.get(key)!;
      e.clicks += item.clicks;
      e.impressions += item.impressions;
      e.ctrSum += (item.ctr / 100) * item.impressions;
      e.posSum += item.position * item.impressions;
    }

    return Array.from(grouped.values()).map(entry => ({
      date: entry.date,
      clicks: entry.clicks,
      impressions: entry.impressions,
      ctr: entry.impressions > 0 ? (entry.ctrSum / entry.impressions) * 100 : 0,
      position: entry.impressions > 0 ? entry.posSum / entry.impressions : 0
    }));

  }, [siteDetailsSeries, siteDetailsView]);

  // Exports logic
  const handleExportSummary = () => {
    if (!allData.length) {
      alert('No summary information exists to write reports.');
      return;
    }
    const exportRows = allData.map(s => ({
      'Website': s.name,
      'Type': s.type,
      'Clicks': s.clicks,
      'Impressions': s.impressions,
      'CTR %': parseFloat(s.ctr.toFixed(2)),
      'Avg Position': parseFloat(s.position.toFixed(1))
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SEO Sites Summary');
    XLSX.writeFile(wb, `seo-summary-${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportModal(false);
  };

  const handleExportDailyBreakdown = async () => {
    if (!allData.length) {
      alert('No data is listed to formulate daily metrics.');
      return;
    }
    const { start, end } = getDates();
    if (!start || !end) {
      alert('Valid start and end points must be specified.');
      return;
    }

    setShowProgress(true);
    setLoadingPercent(0);
    setLoadingText('Formulating comprehensive historic breakdown...');

    try {
      const allDailyRows: any[] = [];

      if (!hasValidSession()) {
        // Offline demo excel report creation
        for (let i = 0; i < allData.length; i++) {
          const site = allData[i];
          const percent = Math.round(((i + 1) / allData.length) * 100);
          setLoadingPercent(percent);
          setLoadingText(`Batching Demo Site: ${site.name} (${i + 1}/${allData.length})`);
          await new Promise((resolve) => setTimeout(resolve, 50));

          const series = generateMockTimeSeriesForSingleSite(start, end, site);
          for (const day of series) {
            allDailyRows.push({
              'Website': site.name,
              'Date': day.date,
              'Clicks': day.clicks,
              'Impressions': day.impressions,
              'CTR %': parseFloat(day.ctr.toFixed(2)),
              'Avg Position': parseFloat(day.position.toFixed(1))
            });
          }
        }
      } else {
        const token = await getValidToken();
        for (let i = 0; i < allData.length; i++) {
          const site = allData[i];
          const percent = Math.round(((i + 1) / allData.length) * 100);
          setLoadingPercent(percent);
          setLoadingText(`Batching Site: ${site.name} (${i + 1}/${allData.length})`);

          // Get single site time series
          const seriesUrl = `${GSC_BASE}/sites/${encodeURIComponent(site.url)}/searchAnalytics/query`;
          const cacheKey = `site_ts_${site.url}_${start}_${end}`;
          let series = await cache.get<TimeSeriesEntry[]>(cacheKey);

          if (!series) {
            const queryRes = await fetch(seriesUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` , 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startDate: start,
                endDate: end,
                type: 'web',
                aggregationType: 'byProperty',
                dataState: 'all',
                dimensions: ['date'],
                rowLimit: 500
              })
            });

            if (queryRes.ok) {
              const detailObj = await queryRes.json();
              series = (detailObj.rows || []).map((row: any) => ({
                date: row.keys[0],
                clicks: Math.round(row.clicks),
                impressions: Math.round(row.impressions),
                ctr: row.ctr * 100,
                position: row.position
              }));
              await cache.set(cacheKey, series, 7200);
            } else {
              series = [];
            }
          }

          if (series) {
            for (const day of series) {
              allDailyRows.push({
                'Website': site.name,
                'Date': day.date,
                'Clicks': day.clicks,
                'Impressions': day.impressions,
                'CTR %': parseFloat(day.ctr.toFixed(2)),
                'Avg Position': parseFloat(day.position.toFixed(1))
              });
            }
          }
        }
      }

      setLoadingPercent(98);
      setLoadingText('Formatting worksheets...');

      const ws = XLSX.utils.json_to_sheet(allDailyRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily breakdown');
      XLSX.writeFile(wb, `seo-daily-${start}_to_${end}.xlsx`);

      setLoadingPercent(100);
      setLoadingText('Report Download Triggered!');
      setTimeout(() => setShowProgress(false), 500);
      setShowExportModal(false);

    } catch (err: any) {
      alert('Excel exportation failed: ' + err.message);
      setShowProgress(false);
    }
  };

  // Leads Page Interactive States
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadWebsite, setLeadWebsite] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadHealth, setLeadHealth] = useState<'Optimal' | 'Warnings' | 'Critical'>('Warnings');
  const [leadStatus, setLeadStatus] = useState<'Pending Request' | 'Analyzing' | 'Audit Ready' | 'Closed/Won' | 'Archived'>('Pending Request');
  const [leadNotes, setLeadNotes] = useState('');
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<string>('all');

  // Keyword Tracker Interactive States
  const [showAddKeywordModal, setShowAddKeywordModal] = useState(false);
  const [kwName, setKwName] = useState('');
  const [kwDomain, setKwDomain] = useState('');
  const [kwDesktopRank, setKwDesktopRank] = useState<number>(10);
  const [kwMobileRank, setKwMobileRank] = useState<number>(10);
  const [kwVolume, setKwVolume] = useState<number>(1000);
  const [kwComp, setKwComp] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [kwSearch, setKwSearch] = useState('');
  const [kwDomainFilter, setKwDomainFilter] = useState<string>('all');

  // Add custom SEO Lead handler
  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadWebsite) return;
    const newId = `L-${100 + leads.length + 1}`;
    const score = Math.floor(Math.random() * 60) + 40; // 40-100 score
    const errorsCount = Math.floor(Math.random() * 50);
    const warningsCount = Math.floor(Math.random() * 150);
    
    const newLead: Lead = {
      id: newId,
      clientName: leadName,
      websiteUrl: leadWebsite.replace(/^(https?:\/\/)?(www\.)?/, ''),
      email: leadEmail || 'info@' + leadWebsite,
      phone: leadPhone || '—',
      requestedDate: new Date().toISOString().slice(0, 10),
      healthRating: leadHealth,
      status: leadStatus,
      score,
      errorsCount,
      warningsCount,
      notes: leadNotes || 'No initial audit logs defined.'
    };
    
    setLeads([newLead, ...leads]);
    
    // Reset form states
    setLeadName('');
    setLeadWebsite('');
    setLeadEmail('');
    setLeadPhone('');
    setLeadHealth('Warnings');
    setLeadStatus('Pending Request');
    setLeadNotes('');
    setShowAddLeadModal(false);
  };

  // Add tracked keyword handler
  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kwName || !kwDomain) return;
    const newId = `K-${String(trackedKeywords.length + 1).padStart(3, '0')}`;
    const estTraffic = Math.round(kwVolume * (1 / kwDesktopRank) * 0.3); // typical conversion CTR model formula
    
    const newKeyword: TrackedKeyword = {
      id: newId,
      keyword: kwName.toLowerCase().trim(),
      domain: kwDomain.replace(/^(https?:\/\/)?(www\.)?/, ''),
      desktopRank: Number(kwDesktopRank),
      mobileRank: Number(kwMobileRank),
      desktopPrev: Math.min(100, Number(kwDesktopRank) + Math.floor(Math.random() * 5) - 2),
      mobilePrev: Math.min(100, Number(kwMobileRank) + Math.floor(Math.random() * 6) - 3),
      searchVolume: Number(kwVolume),
      competition: kwComp,
      estTraffic: Math.max(1, estTraffic)
    };
    
    setTrackedKeywords([newKeyword, ...trackedKeywords]);
    
    // Reset form
    setKwName('');
    setKwDomain('');
    setKwDesktopRank(10);
    setKwMobileRank(10);
    setKwVolume(1000);
    setKwComp('Medium');
    setShowAddKeywordModal(false);
  };

  // Delete lead
  const handleDeleteLead = (id: string) => {
    setLeads(leads.filter(l => l.id !== id));
  };

  // Delete keyword tracking item
  const handleDeleteKeywordItem = (id: string) => {
    setTrackedKeywords(trackedKeywords.filter(k => k.id !== id));
  };

  // Change lead status
  const handleChangeLeadStatus = (id: string, nextStatus: Lead['status']) => {
    setLeads(leads.map(l => l.id === id ? { ...l, status: nextStatus } : l));
  };

  // Subpage: SEO Audit Lead Generator layout
  const renderLeadsPage = () => {
    const filteredLeads = leads.filter(l => {
      const matchSearch = l.clientName.toLowerCase().includes(leadsSearch.toLowerCase()) || 
                          l.websiteUrl.toLowerCase().includes(leadsSearch.toLowerCase()) || 
                          l.email.toLowerCase().includes(leadsSearch.toLowerCase());
      const matchStatus = leadsStatusFilter === 'all' ? true : l.status === leadsStatusFilter;
      return matchSearch && matchStatus;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              📁 SEO Audit &amp; Agency Leads
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage client-submitted audit logs, Crawl Health diagnostics, and inbound service queries.
            </p>
          </div>
          <button
            onClick={() => setShowAddLeadModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/15 cursor-pointer transition-all hover:scale-[1.01]"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Custom Lead</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Total Proposals</span>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">{leads.length} Leads</div>
            <p className="text-[10px] text-slate-400 mt-1">Crawl pipelines activated</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Critical Assets</span>
            <div className="text-2xl font-bold font-mono text-rose-500 mt-1">
              {leads.filter(l => l.healthRating === 'Critical').length} sites
            </div>
            <p className="text-[10px] text-rose-400 mt-1">Needs urgent attention</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Audit Dispatched</span>
            <div className="text-2xl font-bold font-mono text-emerald-500 mt-1">
              {leads.filter(l => l.status === 'Audit Ready' || l.status === 'Closed/Won').length} Dispatched
            </div>
            <p className="text-[10px] text-emerald-400 mt-1">Reports generated</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Win Convert-rate</span>
            <div className="text-2xl font-bold font-mono text-indigo-500 mt-1">
              {leads.length > 0 ? Math.round((leads.filter(l => l.status === 'Closed/Won').length / leads.length) * 100) : 0}%
            </div>
            <p className="text-[10px] text-indigo-400 mt-1">Paid contract retentions</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/85 p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads, URL properties, emails..."
              value={leadsSearch}
              onChange={(e) => setLeadsSearch(e.target.value)}
              className="p-2.5 pl-9 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-200 rounded-lg text-xs tracking-wide focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <select
              value={leadsStatusFilter}
              onChange={(e) => setLeadsStatusFilter(e.target.value)}
              className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-700 dark:text-slate-200 rounded-lg text-xs cursor-pointer focus:outline-none"
            >
              <option value="all">🔍 All Status Categories</option>
              <option value="Pending Request">⏳ Pending Request</option>
              <option value="Analyzing">⚙️ Analyzing Site</option>
              <option value="Audit Ready">✓ Audit Report Ready</option>
              <option value="Closed/Won">🏆 Closed/Won (Active)</option>
              <option value="Archived">📁 Archived</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/35 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest text-left font-bold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 px-5">👤 Client Info</th>
                  <th className="p-4">🌐 Audited Website</th>
                  <th className="p-4 text-center">📊 Site Score</th>
                  <th className="p-4">🚨 Health State</th>
                  <th className="p-4">⚡ Audit Progress</th>
                  <th className="p-4 text-right px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs">
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => {
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="p-4 px-5">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{lead.clientName}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tracking-tight">{lead.email}</span>
                            <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono">{lead.phone}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{lead.websiteUrl}</span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-505 font-mono">Date Requested: {lead.requestedDate}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-[#1c2431] border border-slate-150 dark:border-slate-800/60 shadow-xs">
                            <span className={`text-[13px] font-bold font-mono leading-none ${lead.score && lead.score >= 90 ? 'text-emerald-500' : lead.score && lead.score >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>
                              {lead.score || 0}%
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <span className={`w-fit p-1 px-2.5 rounded-full text-[9px] font-bold leading-none ${lead.healthRating === 'Optimal' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : lead.healthRating === 'Warnings' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                              🔴 {lead.healthRating}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-mono">
                              Errors: {lead.errorsCount} | Warns: {lead.warningsCount}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <select
                            value={lead.status}
                            onChange={(e) => handleChangeLeadStatus(lead.id, e.target.value as any)}
                            className={`p-1 px-2 border dark:bg-[#111827] rounded-lg text-[10.5px] font-bold leading-none cursor-pointer focus:outline-none ${lead.status === 'Pending Request' ? 'bg-slate-150 text-slate-700 border-slate-350' : lead.status === 'Analyzing' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : lead.status === 'Audit Ready' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' : lead.status === 'Closed/Won' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-extrabold' : 'bg-slate-150 text-slate-400 border-slate-300'}`}
                          >
                            <option value="Pending Request">⏳ Pending Request</option>
                            <option value="Analyzing">⚙️ Analyzing Site</option>
                            <option value="Audit Ready">✓ Audit Report Ready</option>
                            <option value="Closed/Won">🏆 Closed/Won (Active)</option>
                            <option value="Archived">📁 Archived</option>
                          </select>
                        </td>
                        <td className="p-4 text-right px-5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              alert(`✏️ Notes audit details for ${lead.clientName}:\n"${lead.notes || 'No added details'}"`);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 p-1.5 px-3 rounded-lg text-indigo-600 dark:text-indigo-400 text-[10px] font-bold mr-1.5 cursor-pointer transition-colors"
                          >
                            Read Notes
                          </button>
                          
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/25 p-1.5 rounded-lg text-rose-500 cursor-pointer hover:text-rose-600 transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                      No audit leads found matching current filter query parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Subpage: GSC Keyword Rank Tracker layout
  const renderRanksPage = () => {
    const activeSandboxWebsites = Array.from(new Set(allData.map(d => d.name)));

    const filteredKeywords = trackedKeywords.filter(k => {
      const matchSearch = k.keyword.toLowerCase().includes(kwSearch.toLowerCase()) || 
                          k.domain.toLowerCase().includes(kwSearch.toLowerCase());
      const matchDomain = kwDomainFilter === 'all' ? true : k.domain === kwDomainFilter;
      return matchSearch && matchDomain;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              🎯 Client Keyword Rank Tracker
            </h1>
          </div>
          <button
            onClick={() => setShowAddKeywordModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/15 cursor-pointer transition-all hover:scale-[1.01]"
          >
            <Plus className="w-4 h-4" />
            <span>Target Keyword SERP</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Tracked Phrases</span>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">{trackedKeywords.length} Keywords</div>
            <p className="text-[10px] text-slate-400 mt-1">SERPs audited periodically</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Avg GSC Position</span>
            <div className="text-2xl font-bold font-mono text-indigo-500 mt-1">
              {(trackedKeywords.reduce((a, b) => a + b.desktopRank, 0) / trackedKeywords.length || 0).toFixed(1)}
            </div>
            <p className="text-[10px] text-indigo-400 mt-1">Top Page 1 rankings</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Total Search Vol.</span>
            <div className="text-2xl font-bold font-mono text-blue-500 mt-1">
              {trackedKeywords.reduce((a, b) => a + b.searchVolume, 0).toLocaleString()} /mo
            </div>
            <p className="text-[10px] text-blue-400 mt-1">Cumulative potential reach</p>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl shadow-xs">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Organic Est. Traffic</span>
            <div className="text-2xl font-bold font-mono text-emerald-500 mt-1">
              {trackedKeywords.reduce((a, b) => a + b.estTraffic, 0).toLocaleString()} visits
            </div>
            <p className="text-[10px] text-emerald-400 mt-1">Inbound click pipelines</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/85 p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search keyword clusters..."
              value={kwSearch}
              onChange={(e) => setKwSearch(e.target.value)}
              className="p-2.5 pl-9 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <select
              value={kwDomainFilter}
              onChange={(e) => setKwDomainFilter(e.target.value)}
              className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-700 dark:text-slate-200 rounded-lg text-xs cursor-pointer focus:outline-none"
            >
              <option value="all">🌐 All Managed Domains</option>
              {activeSandboxWebsites.map(dName => (
                <option key={dName} value={dName}>{dName}</option>
              ))}
              <option value="financepro.com">financepro.com</option>
              <option value="ecommercerush.com">ecommercerush.com</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/35 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest text-left font-bold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 px-5">🔑 Targeted Phrase</th>
                  <th className="p-4">🌐 Managed Asset</th>
                  <th className="p-4 text-center">💻 Desktop Rank</th>
                  <th className="p-4 text-center">📱 Mobile Rank</th>
                  <th className="p-4 text-center">📊 Monthly Volume</th>
                  <th className="p-4 text-center">⚡ Competition</th>
                  <th className="p-4 text-center">📈 Est. Traffic</th>
                  <th className="p-4 text-right px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs font-medium text-slate-750 dark:text-slate-300">
                {filteredKeywords.length > 0 ? (
                  filteredKeywords.map((k) => {
                    const desktopDiff = k.desktopPrev - k.desktopRank;
                    const mobileDiff = k.mobilePrev - k.mobileRank;
                    
                    return (
                      <tr key={k.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="p-4 px-5 font-bold text-slate-800 dark:text-slate-200 font-sans">
                          {k.keyword}
                        </td>
                        <td className="p-4 font-mono text-indigo-600 dark:text-indigo-400 text-[10.5px]">
                          {k.domain}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm bg-slate-50 dark:bg-[#1c2431] border border-slate-150 dark:border-slate-800/60 p-1 px-2.5 rounded-lg">
                              #{k.desktopRank}
                            </span>
                            <span className={`text-[9px] font-mono mt-1 ${desktopDiff > 0 ? 'text-emerald-500 font-extrabold' : desktopDiff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {desktopDiff > 0 ? `▲ +${desktopDiff}` : desktopDiff < 0 ? `▼ ${desktopDiff}` : 'Steady'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm bg-slate-50 dark:bg-[#1c2431] border border-slate-150 dark:border-slate-800/60 p-1 px-2.5 rounded-lg">
                              #{k.mobileRank}
                            </span>
                            <span className={`text-[9px] font-mono mt-1 ${mobileDiff > 0 ? 'text-emerald-500 font-extrabold' : mobileDiff < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {mobileDiff > 0 ? `▲ +${mobileDiff}` : mobileDiff < 0 ? `▼ ${mobileDiff}` : 'Steady'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-center font-mono">
                          {k.searchVolume.toLocaleString()}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`p-1 px-2 rounded-full text-[9.5px] font-bold ${k.competition === 'High' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/10' : k.competition === 'Medium' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/10' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/10'}`}>
                            {k.competition}
                          </span>
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-emerald-500">
                          {k.estTraffic.toLocaleString()}
                        </td>
                        <td className="p-4 text-right px-5">
                          <button
                            onClick={() => handleDeleteKeywordItem(k.id)}
                            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 p-1.5 rounded-lg text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Cease Keyword Tracking"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                      No keywords configured or matching standard filter configurations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Sidebar navigational and settings layout
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-5">
      <div className="space-y-6">
        {/* Logo and title */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-150 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <img
              src="https://assetscout.in/assets/images/Assetscout%20Logo%20Black.webp"
              alt="Assetscout Logo"
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain transition-all duration-200 dark:invert"
            />
          </div>
          {/* Close button for mobile sidebar view */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            title="Close menu drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Menu Nav Links */}
        <div className="space-y-1.5 animate-fade-in">
          
          <button
            onClick={() => {
              setActivePage('home');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-all duration-150 ${activePage === 'home' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/65 hover:text-slate-905 dark:hover:text-slate-100'}`}
          >
            <div className="flex items-center gap-2.5">
              <Home className="w-4 h-4" />
              <span>Home</span>
            </div>
            {activePage === 'home' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>

          <button
            onClick={() => {
              setActivePage('leads');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-all duration-150 ${activePage === 'leads' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/65 hover:text-slate-905 dark:hover:text-slate-100'}`}
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4" />
              <span>Leads Dashboard</span>
            </div>
            {activePage === 'leads' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>

          <button
            onClick={() => {
              setActivePage('ranks');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-all duration-150 ${activePage === 'ranks' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/65 hover:text-slate-905 dark:hover:text-slate-100'}`}
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-4 h-4" />
              <span>Rank Tracker</span>
            </div>
            {activePage === 'ranks' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
        </div>
      </div>

      <div className="space-y-4 pt-5 border-t border-slate-150 dark:border-slate-800/60">
        {/* Dark/Light Segment Controls */}
        <div className="bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase pl-2 select-none font-mono">Theme</span>
          <div className="flex gap-1">
            <button
              onClick={() => setTheme('light')}
              style={{ contentVisibility: 'auto' }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'light' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-400 hover:text-slate-650'}`}
              title="Activate Day Theme"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'dark' ? 'bg-[#111827] text-amber-400 shadow-xs' : 'text-slate-400 hover:text-slate-300'}`}
              title="Activate Cosmic Theme"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => {
            setGscConnected(false);
            setSidebarOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-all duration-150 text-rose-600 dark:text-rose-455 hover:bg-rose-50 dark:hover:bg-rose-950/20"
        >
          <LogOut className="w-4 h-4 text-rose-550 dark:text-rose-400" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  // Toggle dynamic metric lines inside the time series
  const toggleActiveMetric = (m: string) => {
    const next = new Set<string>(activeMetrics);
    if (next.has(m)) {
      if (next.size === 1) return; // Retain at least one
      next.delete(m);
    } else {
      next.add(m);
    }
    setActiveMetrics(next);
  };

  if (!gscConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
        {/* Decorative ambient glowing backdrops */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] md:w-[420px] h-[340px] md:h-[420px] rounded-full bg-indigo-500/10 blur-3xl pointer-events-none select-none" />
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 w-[280px] md:w-[350px] h-[280px] md:h-[350px] rounded-full bg-emerald-555/5 blur-3xl pointer-events-none select-none" />

        <div className="max-w-[480px] w-full bg-white border border-slate-200/65 rounded-3xl shadow-2xl p-8 relative overflow-hidden transition-all duration-300 z-10 flex flex-col items-center">
          {/* Accent glow line at top */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-indigo-600" />

          {/* Logo Brand Header */}
          <div className="flex flex-col items-center gap-1.5 mb-6 text-center select-none">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/50 shadow-xs mb-1">
              <img
                src="https://assetscout.in/assets/images/Assetscout%20Logo%20Black.webp"
                alt="Assetscout Logo"
                referrerPolicy="no-referrer"
                className="h-12 w-auto object-contain hover:scale-[1.03] transition-all duration-200"
              />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 font-sans">
              SEO Main Dashboard
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-tight">
              Secure Login
            </p>
          </div>

          {/* Loading Progress inside Card */}
          {showProgress && (
            <div className="w-full mb-6 bg-slate-50 border border-slate-250/20 p-4 rounded-xl">
              <div className="flex justify-between items-center text-[11px] font-semibold font-mono mb-2 text-slate-550">
                <span>{loadingText}</span>
                <span className="text-indigo-600 font-bold">{loadingPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-emerald-555 rounded-full transition-all duration-300"
                  style={{ width: `${loadingPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Sync status messages */}
          {exchangeMsg && (
            <div className={`w-full p-4 mb-6 rounded-2xl text-xs font-mono leading-relaxed border flex items-start gap-2.5 ${
              exchangeMsg.type === 'err' 
                ? 'bg-rose-50/50 text-rose-600 border-rose-220/30' 
                : exchangeMsg.type === 'ok' 
                ? 'bg-emerald-50/50 text-emerald-600 border-emerald-220/30' 
                : 'bg-indigo-50/50 text-indigo-600 border-indigo-220/30'
            }`}>
              <div className="font-semibold flex-1 select-all">{exchangeMsg.text}</div>
            </div>
          )}

          {/* Action Column */}
          <div className="w-full space-y-3">
            <button
              onClick={triggerGSCConnect}
              className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold rounded-2xl text-xs tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/15"
            >
              <Globe className="w-4 h-4" />
              <span>CONNECT SEARCH CONSOLE</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090f1c] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200 flex">
      {/* SIDEBAR/DRAWER OVERLAY - MOBILES AND DESKTOPS */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs transition-opacity duration-150"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Menu Drawer Content */}
          <aside className="relative flex flex-col w-64 max-w-xs bg-white dark:bg-[#111827] h-full shadow-2xl border-r border-slate-200 dark:border-slate-800/80 p-0 justify-between animate-slide-in">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex-1 min-w-0 transition-all">
        <div className="w-full max-w-none px-4 md:px-6 py-4 space-y-6">
          
          {/* Core Header Area */}
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs transition-colors">
            {/* Left Column: Menu Button and Page Title */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-start">
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 cursor-pointer flex items-center justify-center shrink-0 shadow-xs transition-colors"
                title="Toggle navigation index drawer"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="text-left">
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 select-all">
                  {activePage === 'home' ? 'SEO Main Dashboard' : activePage === 'leads' ? 'SEO Lead Manager' : 'Keyword Rank Tracker'}
                </h1>
              </div>
            </div>

            {/* Center Column: Centered Brand Logo (No Sidebar line and little bit larger) */}
            <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-1 mx-auto">
              <div className="flex items-center shrink-0">
                <img
                  src="https://assetscout.in/assets/images/Assetscout%20Logo%20Black.webp"
                  alt="Assetscout Logo"
                  referrerPolicy="no-referrer"
                  className="h-10 md:h-12 w-auto object-contain transition-all duration-200 hover:scale-[1.02] dark:invert"
                />
              </div>
            </div>

            {/* Right Column: Refresh Reports */}
            <div className="flex items-center gap-2.5 justify-end w-full md:w-auto">
              <button
                onClick={handleFullRefresh}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/10"
                title="Refresh dashboard metrics and clear caching layers immediately"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${showProgress ? 'animate-spin' : ''}`} />
                <span>Refresh Reports</span>
              </button>
            </div>
          </header>

        {/* Dynamic Loading Progress Bar */}
        {showProgress && (
          <div className="mb-6 bg-white dark:bg-[#0d1420] border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-md animate-fade-in">
            <div className="flex justify-between items-center text-xs font-mono mb-2 text-slate-500 dark:text-slate-400">
              <span className="font-semibold">{loadingText}</span>
              <span>{loadingPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${loadingPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Subpage Router */}
        {activePage === 'leads' ? (
          <LeadsDashboard theme={theme} />
        ) : activePage === 'ranks' ? (
          <RankTracker theme={theme} />
        ) : (
          
          /* ACTIVE USER DASHBOARD */
          <div className="space-y-6">
            
            {/* Control Filtering & Calendar row */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs flex flex-wrap items-end gap-4 justify-between transition-colors">
              <div className="flex flex-wrap items-end gap-4 flex-1 w-full md:w-auto">
                {/* Custom calendar selection component */}
                <CalendarPicker
                  preset={preset}
                  setPreset={setPreset}
                  calState={calState}
                  setCalState={setCalState}
                  onApply={() => pullMainAnalytics(true)}
                />

                {/* Sort Criteria Selector */}
                <div className="flex flex-col gap-1.5 min-w-[130px]">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="p-2.5 px-3 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs leading-tight font-sans transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer"
                  >
                    <option value="clicks">Clicks</option>
                    <option value="impressions">Impressions</option>
                    <option value="ctr">CTR</option>
                    <option value="position">Position</option>
                  </select>
                </div>

                {/* Sort Order (High/Low) Selector */}
                <div className="flex flex-col gap-1.5 min-w-[140px]">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                    Order
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                    className="p-2.5 px-3 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs leading-tight font-sans transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer"
                  >
                    <option value="desc">High to Low</option>
                    <option value="asc">Low to High</option>
                  </select>
                </div>

                {/* Search Text Input (decreased/compact size) */}
                <div className="flex flex-col gap-1.5 min-w-[150px] md:max-w-[200px] flex-1">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                    Search Properties
                  </label>
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-3.5 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter properties..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="p-2.5 pl-8 pr-3 w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1f2937] text-slate-800 dark:text-slate-100 rounded-lg text-xs leading-tight font-sans transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Utility actions */}
              <div className="flex items-center gap-2 self-end">
                <button
                  onClick={handleFullRefresh}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 flex items-center gap-1.5 shadow-md shadow-indigo-600/10 hover:scale-[1.01]"
                  title="Purge local caches and execute requests directly against Google APIs"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-reverse" />
                  <span>Refresh</span>
                </button>

                <button
                  onClick={() => setShowExportModal(true)}
                  className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 flex items-center gap-1.5 shadow-md shadow-emerald-500/10 hover:scale-[1.01]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Performance KPIs Grid Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Clicks */}
              <div className="bg-white dark:bg-[#111827] border-t-2 border-t-blue-600 dark:border-t-blue-500 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-xl shadow-xs hover:shadow-md transition-all duration-250">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold tracking-wider uppercase">Total Clicks</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400">
                  {totals.clicks.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Aggregated organic visits</div>
              </div>

              {/* Card 2: Impressions */}
              <div className="bg-white dark:bg-[#111827] border-t-2 border-t-purple-600 dark:border-t-purple-500 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-xl shadow-xs hover:shadow-md transition-all duration-250">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold tracking-wider uppercase">Total Impressions</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-purple-600 dark:text-purple-400">
                  {totals.impressions.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Search appearance frequency</div>
              </div>

              {/* Card 3: CTR */}
              <div className="bg-white dark:bg-[#111827] border-t-2 border-t-emerald-600 dark:border-t-emerald-500 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-xl shadow-xs hover:shadow-md transition-all duration-250">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold tracking-wider uppercase">Average CTR</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                  {totals.ctr.toFixed(2)}%
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Click through rate average</div>
              </div>

              {/* Card 4: Position */}
              <div className="bg-white dark:bg-[#111827] border-t-2 border-t-amber-500 border border-slate-200/80 dark:border-slate-800/80 p-5 rounded-xl shadow-xs hover:shadow-md transition-all duration-250">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold tracking-wider uppercase">Avg Position</span>
                </div>
                <div className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-amber-600 dark:text-amber-400">
                  {totals.position > 0 ? totals.position.toFixed(1) : '—'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Impression weighted rating</div>
              </div>
            </div>

            {/* Combined performance over time trend graph */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-6 rounded-2xl shadow-xs transition-colors">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm md:text-base font-bold text-slate-700 dark:text-slate-350 flex items-center gap-1.5">
                    Combined Performance Over Time
                  </h3>
                  <select
                    value={timeSeriesInterval}
                    onChange={(e) => setTimeSeriesInterval(e.target.value as 'daily' | 'weekly' | 'monthly')}
                    className="p-1 px-2.5 border border-slate-200 dark:border-slate-850 bg-slate-55 dark:bg-[#1f2937] text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer"
                    title="Time grouping granularity"
                  >
                    <option value="daily">📅 Daily</option>
                    <option value="weekly">🗓️ Weekly</option>
                    <option value="monthly">📊 Monthly</option>
                  </select>
                </div>
                
                {/* Metric toggle controls */}
                <div className="flex gap-2 flex-wrap justify-end">
                  {/* Clicks toggle */}
                  <button
                    onClick={() => toggleActiveMetric('clicks')}
                    className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-xs font-semibold select-none border transition-all cursor-pointer ${activeMetrics.has('clicks') ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 opacity-100 shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-55'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span>Clicks</span>
                  </button>

                  {/* Impressions toggle */}
                  <button
                    onClick={() => toggleActiveMetric('impressions')}
                    className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-xs font-semibold select-none border transition-all cursor-pointer ${activeMetrics.has('impressions') ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 opacity-100 shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-55'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span>Impressions</span>
                  </button>

                  {/* CTR toggle */}
                  <button
                    onClick={() => toggleActiveMetric('ctr')}
                    className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-xs font-semibold select-none border transition-all cursor-pointer ${activeMetrics.has('ctr') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 opacity-100 shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-55'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>CTR</span>
                  </button>

                  {/* Position toggle */}
                  <button
                    onClick={() => toggleActiveMetric('position')}
                    className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-xs font-semibold select-none border transition-all cursor-pointer ${activeMetrics.has('position') ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 opacity-100 shadow-sm' : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-55'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Position</span>
                  </button>
                </div>
              </div>

              {/* Rendering canvas Wrapper */}
              {timeSeries.length > 0 ? (
                <div className="h-[270px]">
                  <PerformanceChart
                    data={timeSeriesGrouped}
                    activeMetrics={activeMetrics}
                    isDark={theme === 'dark'}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 dark:text-slate-500 min-h-[250px] bg-slate-50 dark:bg-[#060a12]/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-850">
                  <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-xs font-mono">No time-series data loaded for this range.</span>
                </div>
              )}
            </div>

            {/* Top 10 Columns Row Header with Dual Selection (Dropdown + Segment Buttons) */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs transition-colors space-y-4">

              {/* The 2 Horizontal Bar Charts with independent source menus */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Left Chart */}
                <div className="bg-slate-50/20 dark:bg-[#0c121e]/30 border border-slate-150/80 dark:border-slate-850 p-4 rounded-xl">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-blue-500" />
                      <span>Top 10 {clicksChartSource === 'domain' ? 'Domains' : 'Keywords'} by Clicks</span>
                    </h4>
                    <select
                      value={clicksChartSource}
                      onChange={(e) => setClicksChartSource(e.target.value as 'domain' | 'keyword')}
                      className="p-1 px-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer transition-all hover:border-slate-300 dark:hover:border-slate-600"
                    >
                      <option value="domain">🌐 Domains</option>
                      <option value="keyword">🔑 Keywords</option>
                    </select>
                  </div>
                  {allData.length > 0 ? (
                    <TopSitesBarChart
                      sites={clicksChartSource === 'domain' ? allData : topKeywordsData}
                      metric="clicks"
                      isDark={theme === 'dark'}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-xs font-mono text-slate-455 dark:text-slate-500">
                      No records available.
                    </div>
                  )}
                </div>

                {/* Right Chart */}
                <div className="bg-slate-50/20 dark:bg-[#0c121e]/30 border border-slate-150/80 dark:border-slate-850 p-4 rounded-xl">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-emerald-500" />
                      <span>Top 10 {ctrChartSource === 'domain' ? 'Domains' : 'Keywords'} by CTR</span>
                    </h4>
                    <select
                      value={ctrChartSource}
                      onChange={(e) => setCtrChartSource(e.target.value as 'domain' | 'keyword')}
                      className="p-1 px-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500/20 shadow-xs cursor-pointer transition-all hover:border-slate-300 dark:hover:border-slate-600"
                    >
                      <option value="domain">🌐 Domains</option>
                      <option value="keyword">🔑 Keywords</option>
                    </select>
                  </div>
                  {allData.length > 0 ? (
                    <TopSitesBarChart
                      sites={ctrChartSource === 'domain' ? allData : topKeywordsData}
                      metric="ctr"
                      isDark={theme === 'dark'}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-xs font-mono text-slate-455 dark:text-slate-500">
                      No records available.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Table View Source Selection (Two separate buttons) */}
            <div className="flex items-center justify-start gap-4 mb-4 select-none">
              {/* Two separate toggle buttons */}
              <div className="flex items-center gap-2 bg-slate-100/60 dark:bg-[#111827] p-1 rounded-xl border border-slate-200/50 dark:border-slate-800 shadow-sm shrink-0">
                <button
                  type="button"
                  onClick={() => setTableMode('domain')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${tableMode === 'domain' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
                >
                  Domain
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode('keyword')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${tableMode === 'keyword' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
                >
                  Keyword
                </button>
              </div>
            </div>

            {/* Properties classification thin status ribbon - placed above the table */}
            {tableMode === 'domain' && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-100/40 dark:bg-slate-950/20 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400 transition-colors shadow-none select-none">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{sitesClassification.total} properties total</span>
                  <span className="text-slate-300 dark:text-slate-800">•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{sitesClassification.withData} with data</span>
                  <span className="text-slate-300 dark:text-slate-800">•</span>
                  <span className="text-amber-550 dark:text-amber-500 font-semibold">{sitesClassification.noData.length} without data</span>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNoDataDropdown(!showNoDataDropdown)}
                    className="p-1 px-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5 text-[11px] transition-all cursor-pointer shadow-sm"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>Sites with no data ({sitesClassification.noData.length})</span>
                    <span>▼</span>
                  </button>

                  {showNoDataDropdown && (
                    <div className="absolute right-0 top-full mt-1.5 z-40 w-[240px] max-h-[220px] overflow-y-auto bg-white dark:bg-[#1a2333] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 text-slate-750 dark:text-slate-200">
                      <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-1 mb-2">Properties with 0 Clicks/Imps</span>
                      {sitesClassification.noData.length > 0 ? (
                        <div className="space-y-1.5">
                          {sitesClassification.noData.map(site => (
                            <div key={site.url} className="text-[11px] font-mono p-1 border-b border-slate-50 dark:border-slate-900/40 text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">
                              {site.name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] block text-center text-emerald-555 dark:text-emerald-450 py-3 font-semibold">All linked properties active! 🎉</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Table Property list */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-colors">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/30 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest text-left font-bold select-none border-b border-slate-200 dark:border-slate-800">
                      <th className="p-4 px-5">{tableMode === 'domain' ? '🌐 Website' : '🔑 Search Keyword'}</th>
                      <th
                        className={`p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors ${sortBy === 'clicks' ? 'text-blue-500' : ''}`}
                        onClick={() => setSortBy('clicks')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Clicks</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className={`p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors ${sortBy === 'impressions' ? 'text-blue-500' : ''}`}
                        onClick={() => setSortBy('impressions')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Impressions</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className={`p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors ${sortBy === 'ctr' ? 'text-blue-500' : ''}`}
                        onClick={() => setSortBy('ctr')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>CTR</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className={`p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors ${sortBy === 'position' ? 'text-blue-500' : ''}`}
                        onClick={() => setSortBy('position')}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Position</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800/80 text-xs">
                    {sortedTableData.length > 0 ? (
                      sortedTableData.map((site) => {
                        return (
                          <tr
                            key={site.url}
                            onClick={() => {
                              if (tableMode === 'domain') {
                                handleOpenDetailedModal(site);
                              } else {
                                // Keyword Click Interaction: Pivot back to Domain View, filter by this keyword
                                setSearchTerm(site.name);
                                setTableMode('domain');
                              }
                            }}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer transition-colors duration-150 py-3.5 group animate-fade-in"
                            title={tableMode === 'domain' ? 'Click to inspect detailed metrics for this URL property' : `Click to filter websites ranking for "${site.name}" keyword`}
                          >
                            <td className="p-4 px-5">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition-colors flex items-center gap-1.5">
                                  {site.name} {tableMode === 'domain' ? (
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                                  ) : (
                                    <Search className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-75 transition-opacity" />
                                  )}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tracking-wider">{site.type}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="p-1 px-2.5 rounded bg-blue-500/10 text-blue-500 font-semibold font-mono tracking-wide">{site.clicks.toLocaleString()}</span>
                            </td>
                            <td className="p-4">
                              <span className="p-1 px-2.5 rounded bg-purple-500/10 text-purple-500 font-semibold font-mono tracking-wide">{site.impressions.toLocaleString()}</span>
                            </td>
                            <td className="p-4">
                              <span className="p-1 px-2.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold font-mono tracking-wide">{site.ctr.toFixed(2)}%</span>
                            </td>
                            <td className="p-4">
                              <span className={`p-1 px-2.5 rounded font-semibold font-mono tracking-wide ${site.position === 0 ? 'bg-rose-500/10 text-rose-500' : site.position <= 3 ? 'bg-emerald-500/10 text-emerald-500' : site.position <= 10 ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                                {site.position > 0 ? site.position.toFixed(1) : '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-450 dark:text-slate-500 font-mono">
                          No matching properties identified.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* SITE DETAILS IN-PAGE DIALOG MODAL */}
        {selectedSite && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-[1100px] w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-up transition-colors">
              
              {/* Modal Head */}
              <div className="p-5 border-b border-slate-150 dark:border-slate-800/80 flex justify-between items-center bg-slate-50 dark:bg-slate-900/10">
                <h3 className="text-sm md:text-base font-bold text-blue-500 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  <span>📊 {selectedSite.name} — GSC SEO Insights</span>
                </h3>
                <button
                  onClick={() => setSelectedSite(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                
                {/* Specific KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/50 dark:bg-slate-900/40 p-2 border border-slate-100 dark:border-slate-800/50 rounded-xl">
                  {/* clicks */}
                  <div className="p-3 text-center bg-white dark:bg-[#1f2937] border border-slate-200/50 dark:border-slate-750 rounded-lg shadow-xs transition-colors">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Total Clicks</span>
                    <div className="text-xl font-bold font-mono mt-1 text-blue-500">{selectedSite.clicks.toLocaleString()}</div>
                  </div>

                  {/* imps */}
                  <div className="p-3 text-center bg-white dark:bg-[#1f2937] border border-slate-200/50 dark:border-slate-750 rounded-lg shadow-xs transition-colors">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Impressions</span>
                    <div className="text-xl font-bold font-mono mt-1 text-purple-500">{selectedSite.impressions.toLocaleString()}</div>
                  </div>

                  {/* ctr */}
                  <div className="p-3 text-center bg-white dark:bg-[#1f2937] border border-slate-200/50 dark:border-slate-750 rounded-lg shadow-xs transition-colors">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">CTR Avg</span>
                    <div className="text-xl font-bold font-mono mt-1 text-emerald-500">{selectedSite.ctr.toFixed(2)}%</div>
                  </div>

                  {/* position */}
                  <div className="p-3 text-center bg-white dark:bg-[#1f2937] border border-slate-200/50 dark:border-slate-750 rounded-lg shadow-xs transition-colors">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Avg Position</span>
                    <div className="text-xl font-bold font-mono mt-1 text-amber-500">{selectedSite.position > 0 ? selectedSite.position.toFixed(1) : '—'}</div>
                  </div>
                </div>

                {/* View Selector Filter bar */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2 flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-slate-650 dark:text-slate-400 uppercase tracking-widest">Timeline Historic Plot</h4>
                  
                  <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/40">
                    <button
                      onClick={() => setSiteDetailsView('daily')}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${siteDetailsView === 'daily' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'}`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setSiteDetailsView('weekly')}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${siteDetailsView === 'weekly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'}`}
                    >
                      Weekly
                    </button>
                    <button
                      onClick={() => setSiteDetailsView('monthly')}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${siteDetailsView === 'monthly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'}`}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                {/* Plot Canvas */}
                <div className="relative">
                  {siteDetailsLoading ? (
                    <div className="flex items-center justify-center p-10 h-[220px] text-xs font-mono text-slate-500">
                      Querying aggregate trends...
                    </div>
                  ) : aggregatedSiteDetails.length > 0 ? (
                    <SiteDetailsChart
                      data={aggregatedSiteDetails}
                      isDark={theme === 'dark'}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[220px] text-xs font-mono text-slate-500">
                      No matching historical logs found for this period.
                    </div>
                  )}
                </div>

                {/* Keywords Queries Breakdown table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-650 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span>🔍 Top Keyword Clusters</span>
                    <span className="text-[10px] font-normal leading-none bg-slate-100 dark:bg-slate-900/60 p-1 px-2 rounded border border-slate-200/50 dark:border-slate-800/40 font-mono tracking-normal capitalize text-slate-450 dark:text-slate-500 ml-1">Limit 50 queries</span>
                  </h4>

                  <div className="overflow-x-auto rounded-lg border border-slate-200/50 dark:border-slate-800 max-h-[260px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/40 text-[9.5px] uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200/50 dark:border-slate-800">
                          <th className="p-2.5 px-4">Keyword query</th>
                          <th className="p-2.5">Clicks</th>
                          <th className="p-2.5">Impressions</th>
                          <th className="p-2.5">CTR Avg</th>
                          <th className="p-2.5">Avg Rank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px] font-mono text-slate-650 dark:text-slate-300">
                        {siteDetailsKeywords.length > 0 ? (
                          siteDetailsKeywords.map((kw, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                              <td className="p-2.5 px-4 font-sans font-medium text-slate-850 dark:text-slate-200 break-all max-w-[300px]">{kw.keyword || '—'}</td>
                              <td className="p-2.5 text-blue-500 font-semibold">{kw.clicks.toLocaleString()}</td>
                              <td className="p-2.5 text-purple-500 font-semibold">{kw.impressions.toLocaleString()}</td>
                              <td className="p-2.5 text-emerald-500 font-semibold">{kw.ctr.toFixed(1)}%</td>
                              <td className="p-2.5 font-bold text-slate-600 dark:text-slate-400">{kw.position.toFixed(1)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-450 dark:text-slate-500">
                              {siteDetailsLoading ? 'Loading query clusters...' : 'No keyword telemetry recorded.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Smart Automated suggestions banner */}
                <div className="bg-slate-50 dark:bg-[#1f2937] border border-slate-200 dark:border-slate-800 p-4.5 rounded-xl text-xs text-slate-600 dark:text-slate-350 transition-colors">
                  <div className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-205 mb-1 bg-slate-100 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/50 dark:border-slate-800/40">
                    💡 Automated Strategic Content Optimization Action
                  </div>
                  {selectedSite.position <= 10 ? (
                    <p className="p-1">🏆 <strong className="text-emerald-500">Strong site rank!</strong> Prominent visibility established ranking average under page 1 threshold. Target optimizing titles to consolidate and expand Click-Through-Rates (CTR).</p>
                  ) : selectedSite.position <= 20 ? (
                    <p className="p-1">📈 <strong className="text-amber-500">Page 2 rankings.</strong> Average ranks are hovering right beyond Page 1 results list. Upgrading backlink mappings and refreshing article context blocks could quickly push keywords on standard search pages.</p>
                  ) : (
                    <p className="p-1">⚠️ <strong className="text-rose-500">Low organic presence.</strong> Rarity in Page 1 or Page 2 positions. Target indexing long-tail search structures, speed optimizations, and semantic tag audits.</p>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* CUSTOM REPORT EXPORTS POPUP */}
        {showExportModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-[320px] w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 text-center animate-scale-up">
              
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-550 dark:text-slate-400">Export</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800/20 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-3 py-1">
                <button
                  onClick={() => {
                    handleExportSummary();
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



        {/* ADD SEO LEAD POPUP MODAL */}
        {showAddLeadModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-[480px] w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 text-left animate-scale-up">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">🚀 Generate Inbound Agency Lead</h3>
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddLead} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Client Name *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. John Doe"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Target Domain *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. website.com"
                      value={leadWebsite}
                      onChange={(e) => setLeadWebsite(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Client Email</label>
                    <input
                      type="email"
                      placeholder="john@example.com"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Client Phone</label>
                    <input
                      type="text"
                      placeholder="+1 (555) 123-4567"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Crawl Health rating</label>
                    <select
                      value={leadHealth}
                      onChange={(e) => setLeadHealth(e.target.value as any)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-250 rounded-lg text-xs focus:outline-none"
                    >
                      <option value="Optimal">🟢 Optimal state</option>
                      <option value="Warnings">🟡 Warning alerts</option>
                      <option value="Critical">🔴 Critical crash levels</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Audit progress state</label>
                    <select
                      value={leadStatus}
                      onChange={(e) => setLeadStatus(e.target.value as any)}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-250 rounded-lg text-xs focus:outline-none"
                    >
                      <option value="Pending Request">⏳ Pending Request</option>
                      <option value="Analyzing">⚙️ Analyzing Site</option>
                      <option value="Audit Ready">✓ Audit Report Ready</option>
                      <option value="Closed/Won">🏆 Closed/Won (Active)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Inbound Notes / Messages</label>
                  <textarea
                    placeholder="Describe specific structural crawling guidelines or clients instructions..."
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg text-xs h-20 placeholder:text-slate-450"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddLeadModal(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-355 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    Generate Lead
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ADD TRACKED KEYWORD POPUP MODAL */}
        {showAddKeywordModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-[440px] w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 text-left animate-scale-up">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">🎯 Target New Keyword SERP</h3>
                <button
                  type="button"
                  onClick={() => setShowAddKeywordModal(false)}
                  className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddKeyword} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Search Keyword Phrase *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. cloud security audit software"
                    value={kwName}
                    onChange={(e) => setKwName(e.target.value)}
                    className="p-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Managed Website Domain *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. financepro.com"
                    value={kwDomain}
                    onChange={(e) => setKwDomain(e.target.value)}
                    className="p-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Desktop Position *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="100"
                      value={kwDesktopRank}
                      onChange={(e) => setKwDesktopRank(Number(e.target.value))}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Mobile Position *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="100"
                      value={kwMobileRank}
                      onChange={(e) => setKwMobileRank(Number(e.target.value))}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">Monthly Search Vol *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      placeholder="1500"
                      value={kwVolume}
                      onChange={(e) => setKwVolume(Number(e.target.value))}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 dark:text-slate-550 font-bold uppercase tracking-wider">SERP Competition</label>
                    <select
                      value={kwComp}
                      onChange={(e) => setKwComp(e.target.value as any)}
                      className="p-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg text-xs focus:outline-none"
                    >
                      <option value="Low">🟢 Low competition</option>
                      <option value="Medium">🟡 Medium competition</option>
                      <option value="High">🔴 High competition</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddKeywordModal(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-355 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    Add Keyword
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Floating Cache Display Rate */}
        <div
          className="fixed bottom-4 left-4 z-40 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-2 px-3.5 rounded-full text-[10px] font-mono tracking-tight text-slate-500 dark:text-slate-400 select-none shadow-md"
          title="IndexedDB cache optimization rate tracker."
        >
          {cacheDisplay}
        </div>

      </div>
    </div>
  </div>
);
}
