export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const leadsClientEmail = process.env.GOOGLE_LEADS_CLIENT_EMAIL || clientEmail;
  const leadsPrivateKey = process.env.GOOGLE_LEADS_PRIVATE_KEY || privateKey;
  const leadsSpreadsheetId = process.env.GOOGLE_LEADS_SHEET_ID;

  const gscClientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || clientEmail;
  const gscPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || privateKey;
  const gscSpreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || spreadsheetId;

  return res.status(200).json({
    configured: !!(clientEmail && privateKey && spreadsheetId),
    hasEmail: !!clientEmail,
    hasKey: !!privateKey,
    hasSheetId: !!spreadsheetId,
    sheetId: spreadsheetId || null,
    clientEmail: clientEmail || null,

    leadsConfigured: !!(leadsClientEmail && leadsPrivateKey && leadsSpreadsheetId),
    hasLeadsSpecificEmail: !!process.env.GOOGLE_LEADS_CLIENT_EMAIL,
    hasLeadsSpecificKey: !!process.env.GOOGLE_LEADS_PRIVATE_KEY,
    leadsSheetId: leadsSpreadsheetId || null,
    leadsClientEmail: leadsClientEmail || null,

    gscConfigured: !!(gscClientEmail && gscPrivateKey && gscSpreadsheetId),
    hasGscSpecificEmail: !!process.env.GOOGLE_GSC_CLIENT_EMAIL,
    hasGscSpecificKey: !!process.env.GOOGLE_GSC_PRIVATE_KEY,
    gscSheetId: gscSpreadsheetId || null,
    gscClientEmail: gscClientEmail || null,
  });
}
