import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    console.log('SAVE API HIT');
    console.log('BODY:', JSON.stringify(req.body));
    const trackers = req.body;
    if (!Array.isArray(trackers)) {
      return res.status(400).json({ error: 'Body must be an array of trackers' });
    }

    const clientEmail   = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!clientEmail)   return res.status(500).json({ error: 'GOOGLE_CLIENT_EMAIL env var not set' });
    if (!privateKey)    return res.status(500).json({ error: 'GOOGLE_PRIVATE_KEY env var not set' });
    if (!spreadsheetId) return res.status(500).json({ error: 'GOOGLE_SHEET_ID env var not set' });

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('BEFORE CLEAR');
    // Clear existing data rows (keep header row 1)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sheet1!A2:F',
    });
    console.log('AFTER CLEAR');
    if (trackers.length > 0) {
      const values = trackers.map(t => [
        t.id      || '',
        t.domain  || '',
        t.keyword || '',
        t.country || 'in',
        (t.pos === 0 || t.pos === null || t.pos === undefined) ? '' : String(t.pos),
        t.checked || '',
      ]);
      console.log('BEFORE UPDATE');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A2',
        valueInputOption: 'RAW',
        requestBody: { values },
      });
      
      console.log('AFTER UPDATE');
    }
    return res.status(200).json({ success: true, saved: trackers.length });

  } catch (err) {
    console.error('save-trackers error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
