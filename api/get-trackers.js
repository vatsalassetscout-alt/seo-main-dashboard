import dotenv from 'dotenv';
dotenv.config({ override: true });

import { google } from 'googleapis';

function cleanPrivateKey(rawKey) {
  if (!rawKey) return '';
  let key = rawKey.trim();
  
  // 1. Strip outer quotes (double, single, or backticks)
  while (
    (key.startsWith('"') && key.endsWith('"')) || 
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith("`") && key.endsWith("`"))
  ) {
    key = key.slice(1, -1).trim();
  }
  
  // 2. Handle JSON input if the user pasted the entire service account JSON
  if (key.startsWith('{') || key.includes('"private_key"')) {
    try {
      const startBrace = key.indexOf('{');
      const endBrace = key.lastIndexOf('}');
      if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
        const jsonStr = key.substring(startBrace, endBrace + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.private_key) {
          key = parsed.private_key.trim();
        }
      }
    } catch (e) {
      // Try parsing with unescaped characters
      try {
        const unescaped = key.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const startBrace = unescaped.indexOf('{');
        const endBrace = unescaped.lastIndexOf('}');
        if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
          const jsonStr = unescaped.substring(startBrace, endBrace + 1);
          const parsed = JSON.parse(jsonStr);
          if (parsed.private_key) {
            key = parsed.private_key.trim();
          }
        }
      } catch (inner) {
        // Regex fallback
        const match = key.match(/"private_key"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          key = match[1];
        }
      }
    }
  }

  // Strip outer quotes again in case the extracted value was also quoted
  while (
    (key.startsWith('"') && key.endsWith('"')) || 
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith("`") && key.endsWith("`"))
  ) {
    key = key.slice(1, -1).trim();
  }
  
  // 3. Handle double-escaped or single-escaped newlines
  key = key.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  
  // 4. Remove all backslashes. PEM private keys and base64 payloads never contain backslashes.
  key = key.replace(/\\/g, '');
  
  // 5. Extract PEM block and clean its body
  const startMatch = key.match(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  const endMatch = key.match(/-----END [A-Z ]+PRIVATE KEY-----/);
  
  if (startMatch && endMatch) {
    const startMarker = startMatch[0];
    const endMarker = endMatch[0];
    
    const startIdx = key.indexOf(startMarker);
    const endIdx = key.indexOf(endMarker);
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      let body = key.substring(startIdx + startMarker.length, endIdx).trim();
      
      // Keep only valid Base64 characters
      body = body.replace(/[^A-Za-z0-9+/=]/g, '');
      
      // Return a perfectly formatted single-line base64 body within PEM headers
      return `${startMarker}\n${body}\n${endMarker}\n`;
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
