import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Search,
  ExternalLink,
  TrendingUp,
  Check,
  AlertCircle,
  Database,
  Cloud,
  Server
} from 'lucide-react';

interface Tracker {
  id: string;
  domain: string;
  keyword: string;
  country: string;
  pos: number | null; // null = pending, -1 = not found, 0 = checking, >0 = position
  checked: string | null;
}

interface ConfigStatus {
  configured: boolean;
  hasEmail: boolean;
  hasKey: boolean;
  hasSheetId: boolean;
  sheetId: string | null;
  clientEmail: string | null;
}

const FLAGS: { [key: string]: string } = {
  us: '🇺🇸',
  gb: '🇬🇧',
  in: '🇮🇳',
  ca: '🇨🇦',
  au: '🇦🇺',
  de: '🇩🇪',
  fr: '🇫🇷'
};

const COUNTRY_NAMES: { [key: string]: string } = {
  us: 'United States',
  gb: 'United Kingdom',
  in: 'India',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  fr: 'France'
};

export function RankTracker({ theme }: { theme: 'light' | 'dark' }) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  // Storage Mode configuration state
  const [storageMode, setStorageMode] = useState<'local' | 'sheets'>(() => {
    return (localStorage.getItem('rp_storage_mode') as 'local' | 'sheets') || 'local';
  });
  const [sheetsTesting, setSheetsTesting] = useState(false);
  const [sheetsVerified, setSheetsVerified] = useState<boolean | null>(null);

  // Form input states
  const [inpDomain, setInpDomain] = useState('');
  const [inpKeyword, setInpKeyword] = useState('');
  const [inpCountry, setInpCountry] = useState('in');
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Modal input states
  const [modalInpKeyword, setModalInpKeyword] = useState('');
  const [modalInpCountry, setModalInpCountry] = useState('in');

  // Load state and feedback alerts
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: 'success' | 'error' | 'info' }[]>([]);

  // Show a nicely floating toast message
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // 1. Fetch Backend sheet configurations status
  const fetchConfigStatus = async () => {
    try {
      const response = await fetch('/api/config-status');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch {
      // Ignore config check failure
    }
  };

  const loadSampleBackup = () => {
    const sampleTrackers: Tracker[] = [
      { id: '1', domain: 'apple.com', keyword: 'iphone buy online', country: 'us', pos: 1, checked: new Date(Date.now() - 3600000 * 2).toISOString() },
      { id: '2', domain: 'apple.com', keyword: 'tablet specs', country: 'us', pos: 3, checked: new Date(Date.now() - 3600000 * 2).toISOString() },
      { id: '3', domain: 'assetscout.in', keyword: 'real estate pune', country: 'in', pos: 8, checked: new Date(Date.now() - 3600000 * 4).toISOString() },
      { id: '4', domain: 'microsoft.com', keyword: 'cloud software enterprise', country: 'us', pos: 14, checked: new Date(Date.now() - 3600000 * 12).toISOString() }
    ];
    setTrackers(sampleTrackers);
    localStorage.setItem('rp_trackers', JSON.stringify(sampleTrackers));
  };

  // Test Connection to Google Sheets
  const testSheetsConnection = async (showSuccessToast = false) => {
    setSheetsTesting(true);
    setSheetsError(null);
    try {
      const response = await fetch('/api/get-trackers');
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("html")) {
          throw new Error("Server bypassed: Vercel SPA fallbacks to HTML.");
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          setSheetsVerified(true);
          if (showSuccessToast) {
            showToast("Google Sheets Connection Verified Successfully! ✓", "success");
          }
          return { success: true, data };
        }
      }
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson.error || `HTTP ${response.status} ${response.statusText}`;
      setSheetsError(errMsg);
      setSheetsVerified(false);
      return { success: false, error: errMsg };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setSheetsError(errMsg);
      setSheetsVerified(false);
      return { success: false, error: errMsg };
    } finally {
      setSheetsTesting(false);
    }
  };

  // Pull tracker data from sheet
  const pullFromSheet = async () => {
    const res = await testSheetsConnection();
    if (res.success && Array.isArray(res.data)) {
      if (res.data.length === 0) {
        showToast("Google Sheet is connected, but it contains no keyword trackers.", "info");
      } else {
        setTrackers(res.data);
        localStorage.setItem('rp_trackers', JSON.stringify(res.data));
        showToast(`Successfully pulled ${res.data.length} trackers from Google Sheets! ✓`, "success");
      }
    } else {
      showToast(`Pull failed: ${res.error || "Could not connect to Google Sheets"}`, "error");
    }
  };

  // Push tracker data to sheet
  const pushToSheet = async () => {
    setSheetsTesting(true);
    try {
      const response = await fetch('/api/save-trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackers)
      });
      if (response.ok) {
        setSheetsVerified(true);
        setSheetsError(null);
        showToast(`Successfully pushed ${trackers.length} trackers to Google Sheets! ✓`, "success");
      } else {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error || `HTTP ${response.status} ${response.statusText}`;
        setSheetsError(errMsg);
        showToast(`Push failed: ${errMsg}`, "error");
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setSheetsError(errMsg);
      showToast(`Push failed: ${errMsg}`, "error");
    } finally {
      setSheetsTesting(false);
    }
  };

  // Merge local data with Google Sheets data
  const mergeWithSheet = async () => {
    const res = await testSheetsConnection();
    if (res.success && Array.isArray(res.data)) {
      const sheetTrackers = res.data;
      
      // Combine local trackers with sheet trackers, avoiding duplicates by keyword + domain + country
      const merged = [...trackers];
      sheetTrackers.forEach((st) => {
        const exists = merged.some((mt) => 
          mt.domain.toLowerCase().trim() === st.domain.toLowerCase().trim() &&
          mt.keyword.toLowerCase().trim() === st.keyword.toLowerCase().trim() &&
          mt.country.toLowerCase().trim() === st.country.toLowerCase().trim()
        );
        if (!exists) {
          merged.push(st);
        }
      });

      // Save merged trackers locally
      setTrackers(merged);
      localStorage.setItem('rp_trackers', JSON.stringify(merged));
      
      // Save merged trackers back to Google Sheets
      const saveResponse = await fetch('/api/save-trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      if (saveResponse.ok) {
        showToast(`Successfully merged data! ${merged.length} total trackers now tracked & synced. ✓`, "success");
      } else {
        showToast(`Local merge succeeded, but failed to write back to Google Sheet.`, "info");
      }
    } else {
      showToast(`Merge failed: ${res.error || "Could not connect to Google Sheets"}`, "error");
    }
  };

  // Toggle storage mode safely
  const handleToggleStorageMode = async (mode: 'local' | 'sheets') => {
    if (mode === 'sheets') {
      const res = await testSheetsConnection();
      if (!res.success) {
        showToast(`Cannot enable Google Sheets Sync: ${res.error}`, "error");
        return;
      }
    }
    setStorageMode(mode);
    localStorage.setItem('rp_storage_mode', mode);
    showToast(`Storage Mode switched to: ${mode === 'local' ? 'Local Browser Storage' : 'Google Sheets Sync'} ✓`, "info");
  };

  // 2. Load Trackers from local storage OR standard sheets API
  const loadTrackersData = async () => {
    setIsLoading(true);
    setSheetsError(null);
    let loadedFromSheet = false;

    if (storageMode === 'sheets') {
      try {
        const response = await fetch('/api/get-trackers');
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("html")) {
            const remoteData = await response.json();
            if (Array.isArray(remoteData)) {
              setTrackers(remoteData);
              loadedFromSheet = true;
              setSheetsVerified(true);
            }
          }
        }
      } catch (err: any) {
        console.warn('Google sheets load failed on init, using local backup.', err);
      }
    }

    if (!loadedFromSheet) {
      const localString = localStorage.getItem('rp_trackers');
      if (localString) {
        try {
          const parsed = JSON.parse(localString);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTrackers(parsed);
          } else {
            loadSampleBackup();
          }
        } catch {
          loadSampleBackup();
        }
      } else {
        loadSampleBackup();
      }
    }

    // Load local SerpAPI key
    const savedKey = localStorage.getItem('rp_apikey') || '';
    setApiKey(savedKey);
    setApiKeyInput(savedKey ? '••••••••••••••••••••' : '');
    setIsLoading(false);
  };

  useEffect(() => {
    fetchConfigStatus();
    loadTrackersData();
  }, [storageMode]);

  // 3. Sync and Save state to either Sheet database or LocalStorage
  const handleSave = async (updatedTrackers: Tracker[]) => {
    setTrackers(updatedTrackers);
    localStorage.setItem('rp_trackers', JSON.stringify(updatedTrackers));

    if (storageMode === 'sheets') {
      try {
        const response = await fetch('/api/save-trackers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedTrackers)
        });
        if (!response.ok) {
          const errorJson = await response.json().catch(() => ({}));
          const errorMsg = errorJson.error || `HTTP ${response.status} ${response.statusText}`;
          setSheetsError(errorMsg);
          console.warn(`Google Sheet background sync failed: ${errorMsg}`);
        } else {
          setSheetsError(null);
          setSheetsVerified(true);
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        setSheetsError(errorMsg);
        console.warn(`Google Sheet background sync failed: ${errorMsg}`);
      }
    }
  };

  // 4. Save API Key helper
  const handleSaveApiKey = () => {
    const keyToSave = apiKeyInput.trim();
    if (!keyToSave) {
      showToast('Please type or paste a valid non-empty SerpAPI Key.', 'error');
      return;
    }
    if (keyToSave.includes('••••')) {
      showToast('Your existing SerpAPI key is already safely saved & active! ✓', 'info');
      return;
    }
    setApiKey(keyToSave);
    localStorage.setItem('rp_apikey', keyToSave);
    showToast('SerpAPI key saved successfully. Ready for ranks live scan! ✓');
  };

  // 5. Aggregate metrics
  const domainGroups = useMemo(() => {
    const map = new Map<string, Tracker[]>();
    trackers.forEach((t) => {
      if (!map.has(t.domain)) map.set(t.domain, []);
      map.get(t.domain)!.push(t);
    });

    return Array.from(map.entries()).map(([domain, kws]) => {
      const positiveRanks = kws.map((k) => k.pos).filter((p): p is number => p !== null && p > 0);
      
      let best: number | null = null;
      if (positiveRanks.length > 0) {
        best = Math.min(...positiveRanks);
      } else {
        const hasPendingOrChecking = kws.some((k) => k.pos === null || k.pos === 0);
        if (hasPendingOrChecking) {
          best = null;
        } else {
          best = -1;
        }
      }

      const anyRefreshes = kws.some((k) => k.pos === 0);
      const lastChecked = kws
        .map((k) => k.checked)
        .filter(Boolean)
        .sort()
        .at(-1) || null;

      return { domain, kws, best, anyRefreshes, lastChecked };
    });
  }, [trackers]);

  const stats = useMemo(() => {
    const totalDomains = domainGroups.length;
    const totalKeywords = trackers.length;
    const top1Num = trackers.filter((t) => t.pos === 1).length;
    const top10Num = trackers.filter((t) => t.pos !== null && t.pos >= 1 && t.pos <= 10).length;

    return { totalDomains, totalKeywords, top1Num, top10Num };
  }, [domainGroups, trackers]);

  // 6. Check single keyword tracker SERP Rank positional index
  const runSERPCheck = async (id: string, currentList: Tracker[]): Promise<Tracker[]> => {
    const itemIdx = currentList.findIndex((t) => t.id === id);
    if (itemIdx === -1) return currentList;

    const newList = [...currentList];
    newList[itemIdx] = { ...newList[itemIdx], pos: 0 }; // 0 indicates scanning / loading state
    setTrackers(newList);

    const targetItem = newList[itemIdx];

    try {
      const response = await fetch('/api/check-rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          keyword: targetItem.keyword,
          domain: targetItem.domain,
          country: targetItem.country
        })
      });

      const contentType = response.headers.get("content-type") || "";
      let data: any = {};

      if (contentType.includes("html")) {
        throw new Error(`Server returned HTML response (${response.status} ${response.statusText}). The Express server might be sleeping or bypassed.`);
      }

      let responseText = "";
      try {
        responseText = await response.text();
      } catch (e) {
        throw new Error(`Failed to read server response body (${response.status} ${response.statusText}).`);
      }

      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid server response format (${response.status} ${response.statusText}): ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) throw new Error(data.error || 'SERP scan API error');

      newList[itemIdx] = {
        ...newList[itemIdx],
        pos: data.position, // -1 means parsed but not in top 50, >0 represents ranking
        checked: data.checkedAt || new Date().toISOString()
      };

      showToast(
        data.position === -1
          ? `Rank scan completed: "${targetItem.keyword}" was not found inside top 50.`
          : `Rank detected! "${targetItem.keyword}" ranks #${data.position} on search engine page.`,
        'success'
      );
    } catch (err: any) {
      newList[itemIdx] = { ...newList[itemIdx], pos: null };
      showToast(err.message || 'Network timeout occurred checking rank SERPs.', 'error');
    }

    handleSave(newList);
    return newList;
  };

  // 7. Add new keyword tracker from main top filter card
  const handleAddNewTracker = async () => {
    if (!inpDomain || !inpKeyword) {
      showToast('Please specify both a target Web Domain and Keyword to begin tracking.', 'error');
      return;
    }

    const cleanedDomain = inpDomain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();

    if (
      trackers.some(
        (t) =>
          t.domain === cleanedDomain &&
          t.keyword.toLowerCase() === inpKeyword.toLowerCase().trim() &&
          t.country === inpCountry
      )
    ) {
      showToast('This exact keyword configuration is already present in your tracking lists.', 'info');
      return;
    }

    const newId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const newTrackerItem: Tracker = {
      id: newId,
      domain: cleanedDomain,
      keyword: inpKeyword.trim(),
      country: inpCountry,
      pos: null,
      checked: null
    };

    const nextTrackersList = [...trackers, newTrackerItem];
    setTrackers(nextTrackersList);
    setInpKeyword('');
    showToast('New search phrase tracker added successfully.');

    await handleSave(nextTrackersList);

    runSERPCheck(newId, nextTrackersList);
  };

  // 8. Add keyword from within the Domain View Modal popup
  const handleAddModalKeyword = async () => {
    if (!activeDomain) return;
    if (!modalInpKeyword) {
      showToast('Please write a target keyword description.', 'error');
      return;
    }

    if (
      trackers.some(
        (t) =>
          t.domain === activeDomain &&
          t.keyword.toLowerCase() === modalInpKeyword.toLowerCase().trim() &&
          t.country === modalInpCountry
      )
    ) {
      showToast('This keyword is already scheduled for this domain.', 'info');
      return;
    }

    const newId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const newTrackerItem: Tracker = {
      id: newId,
      domain: activeDomain,
      keyword: modalInpKeyword.trim(),
      country: modalInpCountry,
      pos: null,
      checked: null
    };

    const nextTrackersList = [...trackers, newTrackerItem];
    setTrackers(nextTrackersList);
    setModalInpKeyword('');
    showToast('Search keyword added to managed domain pipeline.');

    await handleSave(nextTrackersList);

    runSERPCheck(newId, nextTrackersList);
  };

  // 9. Delete single tracker phrase
  const handleDeleteTracker = async (id: string) => {
    const updated = trackers.filter((t) => t.id !== id);
    showToast('Target phrase tracker removed.');
    handleSave(updated);
  };

  // 10. Refresher procedures
  const handleRefreshDomain = async (domainToRefresh: string) => {
    const kws = trackers.filter((t) => t.domain === domainToRefresh);
    if (kws.length === 0) return;
    showToast(`Refreshing all SEO keywords for "${domainToRefresh}"...`, 'info');

    let currentTempList = [...trackers];
    for (const t of kws) {
      currentTempList = await runSERPCheck(t.id, currentTempList);
      // Wait slight buffer delay to prevent SerpApi concurrency burst triggers
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  };

  const handleRefreshAll = async () => {
    if (trackers.length === 0) {
      showToast('No keyword trackers configured yet.', 'info');
      return;
    }
    if (isRefreshingAll) {
      showToast('SERP scanning queue is already active.', 'info');
      return;
    }

    setIsRefreshingAll(true);
    showToast(`Triggered audit batch for ${trackers.length} target search phrases...`, 'info');

    let currentTempList = [...trackers];
    for (let i = 0; i < trackers.length; i++) {
      currentTempList = await runSERPCheck(trackers[i].id, currentTempList);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setIsRefreshingAll(false);
    showToast('Live SERP tracking update batch completed!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert Popups container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-3.5 px-4 rounded-xl text-xs font-semibold text-white shadow-xl flex items-center gap-2.5 pointer-events-auto animate-fadeIn transition-all transform hover:scale-[1.02] ${
              t.type === 'error'
                ? 'bg-rose-600 border border-rose-500 shadow-rose-600/10'
                : t.type === 'info'
                ? 'bg-blue-600 border border-blue-500 shadow-blue-600/10'
                : 'bg-emerald-600 border border-emerald-500 shadow-emerald-500/10'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            <span className="leading-tight">{t.msg}</span>
          </div>
        ))}
      </div>



      {/* CONTROL DASHBOARD & SETTINGS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SERP API CREDENTIALS CARD */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between transition-all">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">SerpAPI Live Tracking Key</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Enter your premium <a href="https://serpapi.com" target="_blank" rel="noreferrer" className="text-indigo-500 underline font-semibold">SerpAPI</a> key to execute real Google SERP audits. If left empty, the system automatically falls back to zero-cost, high-performance organic search scrapers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Key className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
              <input
                type="password"
                placeholder="Paste your SerpAPI Key here..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="p-2 pl-9 pr-3 w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 outline-none font-medium focus:border-indigo-500/50 h-[38px] transition-all"
              />
            </div>
            <button
              onClick={handleSaveApiKey}
              className="p-2 px-5 rounded-xl font-extrabold text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95 transition-all h-[38px] shadow-md shadow-indigo-600/10"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* STORAGE & SYNC ENGINE CARD */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs flex flex-col justify-between transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Storage & Sync Engine</h4>
              </div>
              <span className={`p-1 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                storageMode === 'sheets'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/20'
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              }`}>
                {storageMode === 'sheets' ? 'Google Sheets Active' : 'Local Browser Mode'}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {storageMode === 'sheets'
                ? "Your rank data is dynamically synced with your Google Spreadsheet. Use sync actions below to manually push, pull, or merge."
                : "Your keywords are safely stored in your browser's Local Storage. If Google Sheets environment variables are configured, you can enable Sync."
              }
            </p>
          </div>

          <div className="space-y-3">
            {/* Mode selection buttons */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => handleToggleStorageMode('local')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                  storageMode === 'local'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/40 dark:border-slate-700/40'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                Local Storage
              </button>
              <button
                type="button"
                disabled={!config?.configured}
                onClick={() => handleToggleStorageMode('sheets')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  storageMode === 'sheets'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/40 dark:border-slate-700/40'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title={!config?.configured ? "Google Sheets environment variables are not fully configured yet." : ""}
              >
                Google Sheets
              </button>
            </div>

            {/* Sync actions panel */}
            {storageMode === 'sheets' && (
              <div className="grid grid-cols-3 gap-2 pt-1 animate-fadeIn">
                <button
                  type="button"
                  onClick={pullFromSheet}
                  disabled={sheetsTesting}
                  className="py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-150 dark:bg-slate-900 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center gap-1 transition-all disabled:opacity-40 cursor-pointer"
                  title="Overwrite local storage with Google Sheets data"
                >
                  📥 Pull Sheet
                </button>
                <button
                  type="button"
                  onClick={pushToSheet}
                  disabled={sheetsTesting}
                  className="py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-150 dark:bg-slate-900 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center gap-1 transition-all disabled:opacity-40 cursor-pointer"
                  title="Overwrite Google Sheet with current local data"
                >
                  📤 Push Sheet
                </button>
                <button
                  type="button"
                  onClick={mergeWithSheet}
                  disabled={sheetsTesting}
                  className="py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-150 dark:bg-slate-900 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center gap-1 transition-all disabled:opacity-40 cursor-pointer"
                  title="Intelligently combine both data sources"
                >
                  🔄 Merge Data
                </button>
              </div>
            )}

            {/* Status light info row */}
            <div className="flex items-center justify-between text-[11px] text-slate-450 dark:text-slate-500 font-medium font-mono pt-1">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  storageMode === 'local'
                    ? 'bg-blue-500 animate-pulse'
                    : sheetsVerified === true
                    ? 'bg-emerald-500'
                    : sheetsVerified === false
                    ? 'bg-rose-500'
                    : 'bg-amber-500 animate-pulse'
                }`} />
                <span>
                  {storageMode === 'local'
                    ? 'Local Storage Mode'
                    : sheetsTesting
                    ? 'Verifying sheets connection...'
                    : sheetsVerified === true
                    ? 'Sheets Connected & Synced ✓'
                    : sheetsVerified === false
                    ? 'Sheets Connection Failed ✗'
                    : 'Sheets connection untested'}
                </span>
              </span>
              
              {storageMode === 'sheets' && !sheetsTesting && sheetsVerified === false && sheetsError && (
                <button
                  type="button"
                  onClick={() => testSheetsConnection(true)}
                  className="text-indigo-500 hover:underline font-bold transition-all cursor-pointer"
                  title={sheetsError}
                >
                  [Retry Connection]
                </button>
              )}

              {storageMode === 'local' && config?.configured && (
                <button
                  type="button"
                  onClick={() => handleToggleStorageMode('sheets')}
                  className="text-indigo-500 hover:underline font-bold transition-all cursor-pointer"
                >
                  [Enable Sheets Sync]
                </button>
              )}
            </div>
            
            {/* Troubleshooter text block */}
            {storageMode === 'sheets' && sheetsVerified === false && sheetsError && (
              <div className="p-2.5 rounded-lg bg-rose-550/10 dark:bg-rose-950/20 border border-rose-500/20 text-[11px] text-rose-600 dark:text-rose-400 font-semibold leading-relaxed font-sans">
                ⚠️ {sheetsError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STATS COUNT GRID CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-1">
        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-purple-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs transition-transform hover:-translate-y-0.5">
          <span className="text-[10.5px] text-slate-450 dark:text-slate-550 font-extrabold uppercase tracking-wider block">
            Total Domains
          </span>
          <div className="text-3xl font-extrabold font-mono text-purple-500 mt-1">
            {stats.totalDomains}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-blue-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs transition-transform hover:-translate-y-0.5">
          <span className="text-[10.5px] text-slate-450 dark:text-slate-550 font-extrabold uppercase tracking-wider block">
            Total Keywords
          </span>
          <div className="text-3xl font-extrabold font-mono text-blue-500 mt-1">
            {stats.totalKeywords}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-amber-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs transition-transform hover:-translate-y-0.5">
          <span className="text-[10.5px] text-slate-450 dark:text-slate-550 font-extrabold uppercase tracking-wider block">
            Top 1
          </span>
          <div className="text-3xl font-extrabold font-mono text-amber-500 mt-1">
            {stats.top1Num}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border-l-3 border-l-emerald-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800/80 dark:border-r-slate-800/80 p-5 rounded-2xl shadow-xs transition-transform hover:-translate-y-0.5">
          <span className="text-[10.5px] text-slate-450 dark:text-slate-550 font-extrabold uppercase tracking-wider block">
            Top 10
          </span>
          <div className="text-3xl font-extrabold font-mono text-emerald-500 mt-1">
            {stats.top10Num}
          </div>
        </div>
      </div>

      {/* COMPACT TARGETING FORM BAR */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-xs grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end transition-colors">
        <div className="md:col-span-3 w-full flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-550 uppercase tracking-wider font-mono select-none">
            Domain
          </label>
          <input
            type="text"
            placeholder="e.g. apple.com"
            value={inpDomain}
            onChange={(e) => setInpDomain(e.target.value)}
            className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-semibold h-[38px]"
          />
        </div>

        <div className="md:col-span-4 w-full flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-555 uppercase tracking-wider font-mono select-none">
            Keyword
          </label>
          <input
            type="text"
            placeholder="e.g. buy premium smart gadgets"
            value={inpKeyword}
            onChange={(e) => setInpKeyword(e.target.value)}
            className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-semibold h-[38px]"
          />
        </div>

        <div className="md:col-span-2 w-full flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-555 uppercase tracking-wider font-mono select-none font-bold">
            Country
          </label>
          <select
            value={inpCountry}
            onChange={(e) => setInpCountry(e.target.value)}
            className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500/50 font-bold h-[38px] cursor-pointer"
          >
            {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {FLAGS[code] || ""} {name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleAddNewTracker}
          className="md:col-span-3 w-full p-2 px-6 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-indigo-600/10 shadow-md hover:scale-[1.01] h-[38px]"
        >
          <Plus className="w-4 h-4" />
          <span>Add & Scan Rank</span>
        </button>
      </div>

      {/* CORE WEB DOMAINS STATUS TABLES */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-end select-none">
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshingAll || isLoading}
            className="p-2 px-4.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-350 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
            <span>{isRefreshingAll ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/40 text-[10.5px] text-slate-450 dark:text-slate-500 uppercase tracking-widest font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="p-4 pl-6">🌐 Domain Assets</th>
                <th className="p-4 text-center">Tracked Keywords Count</th>
                <th className="p-4 text-center">Best Identified Rank</th>
                <th className="p-4">Last Monitored Time</th>
                <th className="p-4 text-right pr-6">Group Audits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs text-slate-750 dark:text-slate-300">
               {domainGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="max-w-md mx-auto space-y-4">
                      <p className="font-mono text-xs leading-relaxed">
                        No web assets currently targeted. If you have connected Google Sheets, make sure your Sheet table has at least one keyword row, or that your Vercel Environment Variables are fully populated.
                      </p>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            loadSampleBackup();
                            showToast("Loaded high-fidelity mock trackers successfully!");
                          }}
                          className="px-4 py-2 border border-slate-250 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-205 rounded-xl cursor-pointer transition-all"
                        >
                          🔌 Load Interactive Test Sandbox Trackers
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                domainGroups.map((g) => {
                  const isAnyCheckedTemp = g.anyRefreshes;
                  const timeStr = g.lastChecked
                    ? new Date(g.lastChecked).toLocaleString()
                    : 'Not queried yet';

                  return (
                    <tr
                      key={g.domain}
                      onClick={() => setActiveDomain(g.domain)}
                      className="hover:bg-slate-55/65 dark:hover:bg-slate-950/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-4 pl-6 font-bold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2.5">
                          <Globe className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0 transition-colors" />
                          <span className="truncate group-hover:text-indigo-500 transition-colors">
                            {g.domain}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 text-center font-bold font-mono">
                        <span className="bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-1 px-3 rounded-lg text-slate-600 dark:text-slate-300">
                          {g.kws.length} keyword{g.kws.length !== 1 ? 's' : ''}
                        </span>
                      </td>

                      <td className="p-4 text-center select-none font-bold">
                        {isAnyCheckedTemp ? (
                          <span className="text-amber-500 font-mono text-[11px] flex items-center justify-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                            <span>Checking...</span>
                          </span>
                        ) : g.best === null ? (
                          <span className="text-slate-400 dark:text-slate-500 font-mono text-[10.5px]">
                            Pending
                          </span>
                        ) : g.best === -1 ? (
                          <span className="text-rose-500 font-mono text-[11px]">Not Found (50+)</span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 p-1 px-3 rounded-lg font-mono">
                            #{g.best}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-slate-500 dark:text-slate-450 font-medium font-mono text-[11px]">
                        {timeStr}
                      </td>

                      <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRefreshDomain(g.domain)}
                          disabled={isAnyCheckedTemp || isRefreshingAll}
                          className="bg-slate-100 font-semibold dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-805 p-1.5 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-40"
                          title="Refresh SERP keyword ranks"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isAnyCheckedTemp ? 'animate-spin' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP DETAIL MODAL FOR SPECIFIC DOMAIN DETAILS */}
      {activeDomain && (
        <div
          onClick={() => setActiveDomain(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative animate-fadeIn flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Domain Profile: <span className="text-indigo-600 dark:text-indigo-400 ml-1 font-mono">{activeDomain}</span>
                </h3>
              </div>
              <button
                onClick={() => setActiveDomain(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Keyword Quick Add row */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-end gap-3.5">
              <div className="flex-1 min-w-[200px] flex flex-col gap-1.5">
                <span className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Target Search Term keyword
                </span>
                <input
                  type="text"
                  placeholder="e.g. check domain credentials specs"
                  value={modalInpKeyword}
                  onChange={(e) => setModalInpKeyword(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div className="w-[140px] flex flex-col gap-1.5">
                <span className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Country
                </span>
                <select
                  value={modalInpCountry}
                  onChange={(e) => setModalInpCountry(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-805 dark:text-slate-200 outline-none focus:border-indigo-500 font-bold h-[38px]"
                >
                  {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {FLAGS[code] || ""} {name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleAddModalKeyword}
                className="p-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer select-none h-[38px] active:scale-95 transition-all text-shadow-sm shrink-0"
              >
                Add Keyword
              </button>
            </div>

            {/* Modal Internal Table details */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/30 dark:bg-slate-900/20 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="p-3.5 pl-6">Target Search Phrase</th>
                    <th className="p-3.5">Country Locale</th>
                    <th className="p-3.5 text-center">SERP Page Position</th>
                    <th className="p-3.5">Last Checked Time</th>
                    <th className="p-3.5 text-right pr-6">Manage Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs text-slate-700 dark:text-slate-350 font-medium">
                  {trackers.filter((t) => t.domain === activeDomain).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500 font-mono">
                        No keywords currently scheduled for this web profile.
                      </td>
                    </tr>
                  ) : (
                    trackers
                      .filter((t) => t.domain === activeDomain)
                      .map((t) => {
                        const isThisChecking = t.pos === 0;

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                            <td className="p-3.5 pl-6 font-bold text-slate-800 dark:text-slate-150">
                              {t.keyword}
                            </td>
                            <td className="p-3.5 font-semibold text-slate-500 dark:text-slate-400">
                              <span className="inline-block mr-1">{FLAGS[t.country]}</span>
                              <span>{t.country.toUpperCase()}</span>
                            </td>
                            <td className="p-3.5 text-center select-none">
                              {isThisChecking ? (
                                <span className="text-amber-500 font-mono font-bold flex items-center justify-center gap-1">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                  <span>Checking...</span>
                                </span>
                              ) : t.pos === null ? (
                                <span className="text-slate-400 font-mono text-[11px]">Pending</span>
                              ) : t.pos === -1 ? (
                                <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 p-1 px-2.5 rounded-lg font-bold font-mono">
                                  Not Found (50+)
                                </span>
                              ) : (
                                <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 p-1 px-3 rounded-lg font-bold font-mono">
                                  #{t.pos}
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-slate-400 dark:text-slate-500 font-mono text-[10.5px]">
                              {t.checked ? new Date(t.checked).toLocaleString() : 'Never audited'}
                            </td>
                            <td className="p-3.5 text-right pr-6">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => runSERPCheck(t.id, trackers)}
                                  disabled={isThisChecking || isRefreshingAll}
                                  className="bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 p-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer disabled:opacity-40"
                                  title="Check SERP position now"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${isThisChecking ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleDeleteTracker(t.id)}
                                  className="bg-rose-50/80 hover:bg-rose-100/90 dark:bg-rose-950/20 p-1.5 rounded-lg border border-rose-100 dark:border-rose-950/40 text-rose-500 cursor-pointer"
                                  title="Stop tracking this keyword"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-150 dark:border-slate-800 text-right">
              <button
                onClick={() => setActiveDomain(null)}
                className="p-2 px-5 bg-slate-200 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-750 text-xs font-extrabold text-slate-750 dark:text-slate-300 rounded-lg cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
