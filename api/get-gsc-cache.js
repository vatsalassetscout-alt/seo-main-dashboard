import dotenv from 'dotenv';
dotenv.config({ override: true });

import { google } from 'googleapis';

function cleanPrivateKey(rawKey) {
  if (!rawKey) return '';
  let key = rawKey.trim();
  
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  
  key = key.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  
  const startMatch = key.match(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  const endMatch = key.match(/-----END [A-Z ]+PRIVATE KEY-----/);
  
  if (startMatch && endMatch) {
    const startMarker = startMatch[0];
    const endMarker = endMatch[0];
    
    const startIdx = key.indexOf(startMarker);
    const endIdx = key.indexOf(endMarker);
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      let body = key.substring(startIdx + startMarker.length, endIdx).trim();
      body = body.replace(/[\s\r\n\\]/g, '');
      
      const chunks = [];
      for (let i = 0; i < body.length; i += 64) {
        chunks.push(body.substring(i, i + 64));
      }
      
      return `${startMarker}\n${chunks.join('\n')}\n${endMarker}`;
    }
  }
  
  return key;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "Missing start or end parameters" });
    }

    const clientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || process.env.GOOGLE_SHEET_ID;

    if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
      return res.status(200).json({ found: false, message: "Google Sheets credentials not configured" });
    }

    const privateKey = cleanPrivateKey(rawPrivateKey);
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    const cacheKey = `gsc_cache_${start}_${end}`;

    // 1. Fetch sites list from GSC_Sites_Db
    let siteRows = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "GSC_Sites_Db!A2:I"
      });
      siteRows = response.data.values || [];
    } catch (e) {
      // Tab might not exist yet, treat as not cached
      return res.status(200).json({ found: false });
    }

    // Filter matching current DateRangeKey
    const filteredSiteRows = siteRows.filter(r => r && r[0] === cacheKey);
    if (filteredSiteRows.length === 0) {
      return res.status(200).json({ found: false });
    }

    // 2. Fetch series points from GSC_Series_Db
    let seriesRows = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "GSC_Series_Db!A2:G"
      });
      seriesRows = response.data.values || [];
    } catch (e) {}

    const filteredSeriesRows = seriesRows.filter(r => r && r[0] === cacheKey);

    // Reconstruct final objects
    const allData = filteredSiteRows.map(r => ({
      url: r[1] || "",
      name: r[2] || "",
      type: r[3] || "Domain",
      clicks: Number(r[4]) || 0,
      impressions: Number(r[5]) || 0,
      ctr: Number(r[6]) || 0,
      position: Number(r[7]) || 0
    }));

    const timeSeries = filteredSeriesRows.map(r => ({
      date: r[1] || "",
      clicks: Number(r[2]) || 0,
      impressions: Number(r[3]) || 0,
      ctr: Number(r[4]) || 0,
      position: Number(r[5]) || 0
    }));

    return res.status(200).json({
      found: true,
      data: { allData, timeSeries }
    });
  } catch (err) {
    console.error("get-gsc-cache error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
