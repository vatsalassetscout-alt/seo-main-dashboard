module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  return res.status(200).json({
    configured: !!(clientEmail && privateKey && spreadsheetId),
    hasEmail: !!clientEmail,
    hasKey: !!privateKey,
    hasSheetId: !!spreadsheetId,
    sheetId: spreadsheetId || null,
    clientEmail: clientEmail || null,
  });
};
