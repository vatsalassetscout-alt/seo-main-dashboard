import { SiteData, TimeSeriesEntry, KeywordEntry } from '../types';

// Helper to parse "YYYY-MM-DD" into a Date object safely
const parseDate = (dStr: string) => {
  const parts = dStr.split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
};

// Helper to format Date as "YYYY-MM-DD"
const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Generate list of dates between start YYYY-MM-DD and end YYYY-MM-DD
const generateDateRange = (startStr: string, endStr: string): string[] => {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

// Generate full time-series aggregate for all mock websites
export const generateMockTimeSeries = (startStr: string, endStr: string, sites: SiteData[]): TimeSeriesEntry[] => {
  const dateStrings = generateDateRange(startStr, endStr);
  return dateStrings.map((date, idx) => {
    const parsed = parseDate(date);
    const dayOfWeek = parsed.getDay();
    // Weekends typically have slightly lower organic SEO traffic
    const cycleFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.68 : 1.12;
    
    let totalClicks = 0;
    let totalImpressions = 0;
    let weightedCtrSum = 0;
    let weightedPosSum = 0;

    sites.forEach((site) => {
      // Bypass inactive properties
      if (site.clicks === 0) return;

      const baseDailyClicks = site.clicks / dateStrings.length;
      const baseDailyImps = site.impressions / dateStrings.length;

      // Add lovely smooth sinusoidal waves + mild noise
      const waves = 0.88 + Math.sin(idx / 3.2) * 0.16 + (Math.random() * 0.08);
      const trendFactor = 1.0 + (idx / dateStrings.length) * 0.15; // smooth 15% growth trajectory
      
      const clicks = Math.max(Math.round(baseDailyClicks * cycleFactor * waves * trendFactor), 1);
      const impressions = Math.max(Math.round(baseDailyImps * cycleFactor * waves * trendFactor), Math.round(clicks * (100 / site.ctr)));
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : site.ctr;
      
      const posFluctuation = site.position + Math.sin(idx / 4.5) * 0.35 + (Math.random() * 0.18 - 0.09);
      const position = Math.max(posFluctuation, 1.0);

      totalClicks += clicks;
      totalImpressions += impressions;
      weightedCtrSum += ctr * impressions;
      weightedPosSum += position * impressions;
    });

    return {
      date,
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? (weightedCtrSum / totalImpressions) : 0,
      position: totalImpressions > 0 ? (weightedPosSum / totalImpressions) : 0
    };
  });
};

// Generate detailed time-series for a single site
export const generateMockTimeSeriesForSingleSite = (startStr: string, endStr: string, site: SiteData): TimeSeriesEntry[] => {
  const dateStrings = generateDateRange(startStr, endStr);
  if (site.clicks === 0) {
    return dateStrings.map(date => ({
      date,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0
    }));
  }

  return dateStrings.map((date, idx) => {
    const parsed = parseDate(date);
    const dayOfWeek = parsed.getDay();
    const cycleFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.72 : 1.15;
    
    const baseDailyClicks = site.clicks / dateStrings.length;
    const baseDailyImps = site.impressions / dateStrings.length;

    const uniqueOffset = site.name.charCodeAt(0) % 6;
    const waves = 0.85 + Math.sin((idx + uniqueOffset) / 2.8) * 0.18 + (Math.random() * 0.1);
    const trendFactor = 1.0 + (idx / dateStrings.length) * 0.18; // smooth 18% growth trajectory

    const clicks = Math.max(Math.round(baseDailyClicks * cycleFactor * waves * trendFactor), 1);
    const impressions = Math.max(Math.round(baseDailyImps * cycleFactor * waves * trendFactor), Math.round(clicks * (100 / site.ctr)));
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : site.ctr;
    
    const posFluctuation = site.position + Math.sin((idx + uniqueOffset) / 4.0) * 0.45 + (Math.random() * 0.16 - 0.08);
    const position = Math.max(posFluctuation, 1.0);

    return {
      date,
      clicks,
      impressions,
      ctr,
      position
    };
  });
};

// Generate high-quality unique keywords queries lists
export const generateMockKeywords = (site: SiteData): KeywordEntry[] => {
  if (site.clicks === 0) return [];

  const genericKeywords = [
    { text: 'seo index analyzer', share: 0.38, rankOffset: -0.3 },
    { text: 'competitor keywords tracker', share: 0.24, rankOffset: 0.5 },
    { text: 'page ranking optimization', share: 0.16, rankOffset: -0.6 },
    { text: 'organic crawl analytics', share: 0.12, rankOffset: 0.9 },
    { text: 'search engine diagnostics', share: 0.10, rankOffset: 1.6 }
  ];

  const siteSpecificKeywordsMap: Record<string, typeof genericKeywords> = {
    'assetscout.in': [
      { text: 'asset tracking checker India', share: 0.36, rankOffset: -0.8 },
      { text: 'asset scout investment platform', share: 0.23, rankOffset: -0.4 },
      { text: 'portfolio assets directory', share: 0.18, rankOffset: 0.2 },
      { text: 'asset metrics search dashboard', share: 0.14, rankOffset: 0.7 },
      { text: 'best portfolio tracking tool', share: 0.09, rankOffset: 1.5 }
    ],
    'blog.assetscout.in': [
      { text: 'how to build investment assets blog', share: 0.40, rankOffset: -0.5 },
      { text: 'asset scout guides indexing', share: 0.22, rankOffset: 0.1 },
      { text: 'top asset class tracking strategies', share: 0.17, rankOffset: 0.4 },
      { text: 'organic indexing for small tech assets', share: 0.11, rankOffset: 1.1 },
      { text: 'blog assetscout in resources', share: 0.10, rankOffset: 0.3 }
    ],
    'app.assetscout.in': [
      { text: 'asset scout web console login', share: 0.45, rankOffset: -0.9 },
      { text: 'free asset tracking spreadsheet import', share: 0.20, rankOffset: 0.3 },
      { text: 'app assetscout active portfolio', share: 0.16, rankOffset: -0.1 },
      { text: 'mutual fund scouter index tool', share: 0.11, rankOffset: 0.8 },
      { text: 'assetscout app secure dashboard', share: 0.08, rankOffset: 1.2 }
    ],
    'scout-seo.com': [
      { text: 'bulk gsc rank checker sc-domain', share: 0.34, rankOffset: -0.6 },
      { text: 'google search console multiple domains views', share: 0.26, rankOffset: 0.3 },
      { text: 'combine search console property stats', share: 0.18, rankOffset: -0.1 },
      { text: 'scout seo console direct dashboard', share: 0.12, rankOffset: 0.8 },
      { text: 'extract keyword ranks to excel bulk', share: 0.10, rankOffset: 1.9 }
    ]
  };

  const kwTemplate = siteSpecificKeywordsMap[site.name] || genericKeywords.map(k => ({
    text: `${site.name.split('.')[0]} ${k.text}`,
    share: k.share,
    rankOffset: k.rankOffset
  }));

  return kwTemplate.map(kw => {
    const clicks = Math.max(Math.round(site.clicks * kw.share), 1);
    const impressions = Math.max(Math.round(site.impressions * (kw.share * 1.15)), Math.round(clicks * 12));
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : site.ctr;
    const position = Math.max(site.position + kw.rankOffset, 1.0);

    return {
      keyword: kw.text,
      clicks,
      impressions,
      ctr,
      position
    };
  });
};
