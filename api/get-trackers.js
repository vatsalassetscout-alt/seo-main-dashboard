import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const clientEmail  = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();    
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    console.log('EMAIL:', clientEmail);
    console.log('SHEET ID:', spreadsheetId);
    console.log('KEY EXISTS:', !!privateKey);
    console.log('KEY LENGTH:', privateKey ? privateKey.length : 0);
    console.log('KEY START:', privateKey ? privateKey.substring(0, 30) : 'NONE');

    if (!clientEmail)   return res.status(500).json({ error: 'GOOGLE_CLIENT_EMAIL env var not set' });
    if (!privateKey)    return res.status(500).json({ error: 'GOOGLE_PRIVATE_KEY env var not set' });
    if (!spreadsheetId) return res.status(500).json({ error: 'GOOGLE_SHEET_ID env var not set' });

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:F',
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
    return res.status(500).json({ error: err.message });
  }
}
