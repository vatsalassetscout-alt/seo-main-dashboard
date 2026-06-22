const { google } = require('googleapis');

module.exports = async (req, res) => {
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
    let privateKey = rawPrivateKey.replace(/\\n/g, '\n');
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.trim();

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
    return res.status(500).json({ error: err.message });
  }
};
