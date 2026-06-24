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
  
  const startMarker = '-----BEGIN PRIVATE KEY-----';
  const endMarker = '-----END PRIVATE KEY-----';
  
  if (key.includes(startMarker)) {
    const startIdx = key.indexOf(startMarker);
    if (startIdx !== -1) {
      key = key.substring(startIdx);
    }
  }
  
  if (key.includes(endMarker)) {
    const endIdx = key.indexOf(endMarker);
    if (endIdx !== -1) {
      key = key.substring(0, endIdx + endMarker.length);
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
    let clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!clientEmail)   return res.status(500).json({ error: 'GOOGLE_CLIENT_EMAIL env var not set' });
    if (!rawPrivateKey)  return res.status(500).json({ error: 'GOOGLE_PRIVATE_KEY env var not set' });
    if (!spreadsheetId) return res.status(500).json({ error: 'GOOGLE_SHEET_ID env var not set' });

    // Handle quote wrapping and escaped newlines correctly in Vercel
    const privateKey = cleanPrivateKey(rawPrivateKey);

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Fetch spreadsheet sheet tabs to avoid 500 error if Sheet1 is named differently or missing
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';

    // 2. Fetch the data table from the first sheet tab
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:F`,
    });

    const rows = response.data.values || [];
    const trackers = rows
      .filter(r => r && r[0])
      .map(r => ({
        id:      r[0] || '',
        domain:  r[1] || '',
        keyword: r[2] || '',
        country: r[3] || 'in',
        pos:     r[4] === '' || r[4] == null ? null : Number(r[4]),
        checked: r[5] || null,
      }));

    return res.status(200).json(trackers);

  } catch (err) {
    console.error('get-trackers error:', err.message);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
