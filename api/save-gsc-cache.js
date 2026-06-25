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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const { start, end, data } = req.body || {};
    if (!start || !end || !data) {
      return res.status(400).json({ error: "Missing start, end, or data parameters" });
    }

    const clientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || process.env.GOOGLE_SHEET_ID;

    if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
      return res.status(400).json({
        error: "Google credentials are not configured in environment backend variables."
      });
    }

    const privateKey = cleanPrivateKey(rawPrivateKey);
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    const cacheKey = `gsc_cache_${start}_${end}`;
    const updatedAt = new Date().toISOString();

    // Ensure GSC_Sites_Db tab exists
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "GSC_Sites_Db" } } }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "GSC_Sites_Db!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["DateRangeKey", "SiteUrl", "SiteName", "SiteType", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"]]
        }
      });
    } catch (e) {}

    // Ensure GSC_Series_Db tab exists
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "GSC_Series_Db" } } }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "GSC_Series_Db!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["DateRangeKey", "Date", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"]]
        }
      });
    } catch (e) {}

    // 1. Process and save GSC_Sites_Db
    const sitesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "GSC_Sites_Db!A:I"
    });
    const sitesRows = sitesResponse.data.values || [];
    const sitesHeaders = sitesRows[0] || ["DateRangeKey", "SiteUrl", "SiteName", "SiteType", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"];
    const filteredSitesRows = sitesRows.slice(1).filter(row => row && row[0] !== cacheKey);

    const newSitesRows = (data.allData || []).map((site) => [
      cacheKey,
      site.url || "",
      site.name || "",
      site.type || "Domain",
      String(site.clicks || 0),
      String(site.impressions || 0),
      String(site.ctr || 0),
      String(site.position || 0),
      updatedAt
    ]);

    const finalSitesRows = [sitesHeaders, ...filteredSitesRows, ...newSitesRows];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "GSC_Sites_Db!A:I"
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "GSC_Sites_Db!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: finalSitesRows
      }
    });

    // 2. Process and save GSC_Series_Db
    const seriesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "GSC_Series_Db!A:G"
    });
    const seriesRows = seriesResponse.data.values || [];
    const seriesHeaders = seriesRows[0] || ["DateRangeKey", "Date", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"];
    const filteredSeriesRows = seriesRows.slice(1).filter(row => row && row[0] !== cacheKey);

    const newSeriesRows = (data.timeSeries || []).map((entry) => [
      cacheKey,
      entry.date || "",
      String(entry.clicks || 0),
      String(entry.impressions || 0),
      String(entry.ctr || 0),
      String(entry.position || 0),
      updatedAt
    ]);

    const finalSeriesRows = [seriesHeaders, ...filteredSeriesRows, ...newSeriesRows];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "GSC_Series_Db!A:G"
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "GSC_Series_Db!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: finalSeriesRows
      }
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("save-gsc-cache error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
