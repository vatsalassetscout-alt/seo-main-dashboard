export interface GscToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface SiteData {
  url: string;
  name: string;
  type: 'Domain' | 'URL';
  clicks: number;
  impressions: number;
  ctr: number; // Percentage (e.g. 5.23)
  position: number;
}

export interface TimeSeriesEntry {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number; // Percentage
  position: number;
}

export interface KeywordEntry {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number; // Percentage
  position: number;
}

export type PresetType = '7' | '28' | '90' | '365' | '1' | 'custom';
export type MetricType = 'clicks' | 'impressions' | 'ctr' | 'position';
export type SiteViewType = 'daily' | 'weekly' | 'monthly';

export interface Lead {
  id: string;
  clientName: string;
  websiteUrl: string;
  email: string;
  phone: string;
  requestedDate: string;
  healthRating: 'Optimal' | 'Warnings' | 'Critical';
  status: 'Pending Request' | 'Analyzing' | 'Audit Ready' | 'Closed/Won' | 'Archived';
  score?: number;
  errorsCount?: number;
  warningsCount?: number;
  notes?: string;
}

export interface TrackedKeyword {
  id: string;
  keyword: string;
  domain: string;
  desktopRank: number;
  mobileRank: number;
  desktopPrev: number;
  mobilePrev: number;
  searchVolume: number;
  competition: 'Low' | 'Medium' | 'High';
  estTraffic: number;
}

