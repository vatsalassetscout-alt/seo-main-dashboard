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
  
  // 4. Extract PEM block and clean its body
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
      
      // Chunk body into 64-character lines for strict PEM formatting expected by OpenSSL 3.0
      const chunks = [];
      for (let i = 0; i < body.length; i += 64) {
        chunks.push(body.substring(i, i + 64));
      }
      
      return `${startMarker}\n${chunks.join('\n')}\n${endMarker}\n`;
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
    const trackers = req.body;
    if (!Array.isArray(trackers)) {
      return res.status(400).json({ error: 'Body must be an array of trackers' });
    }

    let clientEmail   = process.env.GOOGLE_CLIENT_EMAIL;
    let rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY || '';
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

    // Clear existing data rows (keep header row 1)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A2:F`,
    });

    if (trackers.length > 0) {
      const values = trackers.map(t => [
        t.id      || '',
        t.domain  || '',
        t.keyword || '',
        t.country || 'in',
        (t.pos === 0 || t.pos === null || t.pos === undefined) ? '' : String(t.pos),
        t.checked || '',
      ]);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }
    return res.status(200).json({ success: true, saved: trackers.length });

  } catch (err) {
    console.error('save-trackers error:', err.message);
    let enhanced = err.message || String(err);
    const lower = enhanced.toLowerCase();
    if (
      lower.includes("permission") || 
      lower.includes("access") || 
      lower.includes("unauthorized") || 
      lower.includes("caller does not have permission")
    ) {
      enhanced = `Google Sheets Permission Error: The service account does not have access. Share your Google Sheet (ID: ${spreadsheetId || 'configured ID'}) with the email: "${clientEmail || 'your service account email'}" as an 'Editor'.`;
    } else if (
      lower.includes("not found") || 
      lower.includes("requested entity was not found")
    ) {
      enhanced = `Google Sheets Not Found Error: The spreadsheet ID "${spreadsheetId || ''}" could not be found. Please double-check your GOOGLE_SHEET_ID backend environment variable.`;
    } else if (
      lower.includes("unsupported") ||
      lower.includes("decoder") ||
      lower.includes("key")
    ) {
      enhanced = `Google API Key Format Error: The format of your GOOGLE_PRIVATE_KEY is invalid or OpenSSL cannot decode it. Verify that you copied the ENTIRE private key block (including BEGIN/END headers) and that it is placed in your environment settings correctly.`;
    } else if (
      lower.includes("invalid_grant") ||
      lower.includes("signature") ||
      lower.includes("jwt")
    ) {
      enhanced = `Google API Authentication Error (Invalid JWT Signature): The private key does not match the Google service account email: "${clientEmail || ''}". Verify that both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY belong to the exact same service account.`;
    }
    return res.status(500).json({ error: enhanced });
  }
}
