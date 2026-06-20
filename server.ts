import express from "express";
import path from "path";
import axios from "axios";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

function cleanEnvVar(val: string | undefined): string {
  if (!val) return "";
  let s = val.trim();
  // Remove wrapping quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.substring(1, s.length - 1).trim();
  }
  // Replace escaped \n with actual newlines
  s = s.replace(/\\n/g, "\n");
  return s;
}

function cleanSpreadsheetId(val: string | undefined): string {
  let s = cleanEnvVar(val);
  if (s.includes("docs.google.com/spreadsheets")) {
    const match = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return s;
}

const app = express();

// Parse JSON payloads
app.use(express.json());

// Set up CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// 1. Check current backend sheet configurability endpoints
app.get("/api/config-status", (req, res) => {
  const clientEmail = cleanEnvVar(process.env.GOOGLE_CLIENT_EMAIL);
  const privateKey = cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY);
  const spreadsheetId = cleanSpreadsheetId(process.env.GOOGLE_SHEET_ID);
  
  const leadsClientEmail = cleanEnvVar(process.env.GOOGLE_LEADS_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL);
  const leadsPrivateKey = cleanEnvVar(process.env.GOOGLE_LEADS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY);
  const leadsSpreadsheetId = cleanSpreadsheetId(process.env.GOOGLE_LEADS_SHEET_ID);

  res.json({
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
    leadsClientEmail: leadsClientEmail || null
  });
});

// 2. `/api/check-rank`
app.post("/api/check-rank", async (req, res) => {
  const { apiKey, keyword, country = "in", domain } = req.body || {};

  if (!apiKey || !keyword || !domain) {
    return res.status(400).json({
      error: "Missing required fields: apiKey, keyword, domain"
    });
  }

  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  // Scan up to 5 pages (Top 50 results)
  const MAX_PAGES = 5;

  try {
    const fetchPromises = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const startOffset = page * 10;
      const promise = axios
        .get("https://serpapi.com/search.json", {
          params: {
            q: keyword,
            gl: country,
            hl: "en",
            start: startOffset,
            api_key: apiKey
          },
          timeout: 12000,
          headers: {
            Accept: "application/json",
            "User-Agent": "RankPulse/1.0"
          }
        })
        .then((response) => ({ page, data: response.data }))
        .catch((err) => ({ page, error: err }));
      fetchPromises.push(promise);
    }

    // Execute SerpApi concurrently
    const responses = await Promise.all(fetchPromises);
    responses.sort((a, b) => a.page - b.page);

    let position = -1;
    let totalResults = null;
    let domainFound = false;

    for (const response of responses) {
      if (response.error || !response.data) continue;

      const data = response.data;
      if (data.error) {
        return res.status(400).json({ error: data.error });
      }

      if (response.page === 0) {
        totalResults = data.search_information?.total_results ?? null;
      }

      const organicResults = data.organic_results;
      if (Array.isArray(organicResults) && organicResults.length > 0) {
        for (let i = 0; i < organicResults.length; i++) {
          const link = organicResults[i].link || "";
          const rd = link
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .split("/")[0];

          if (
            rd === cleanDomain ||
            rd === `www.${cleanDomain}` ||
            cleanDomain === `www.${rd}` ||
            rd.endsWith(`.${cleanDomain}`)
          ) {
            position = organicResults[i].position || response.page * 10 + i + 1;
            domainFound = true;
            break;
          }
        }
      }
      if (domainFound) break;
    }

    res.status(200).json({
      success: true,
      position,
      keyword,
      domain: cleanDomain,
      country,
      totalResults,
      checkedAt: new Date().toISOString()
    });
  } catch (err: any) {
    if (err.code === "ECONNABORTED") {
      return res.status(504).json({ error: "SerpApi request timed out. Try again." });
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. `/api/get-trackers`
app.get("/api/get-trackers", async (req, res) => {
  try {
    const clientEmail = cleanEnvVar(process.env.GOOGLE_CLIENT_EMAIL);
    const privateKey = cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY);
    const spreadsheetId = cleanSpreadsheetId(process.env.GOOGLE_SHEET_ID);

    console.log("EMAIL:", clientEmail);
    console.log("SHEET ID:", spreadsheetId);
    console.log("KEY EXISTS:", !!privateKey);
    console.log("KEY LENGTH:", privateKey ? privateKey.length : 0);

    if (!clientEmail)   return res.status(500).json({ error: "GOOGLE_CLIENT_EMAIL env var not set" });
    if (!privateKey)    return res.status(500).json({ error: "GOOGLE_PRIVATE_KEY env var not set" });
    if (!spreadsheetId) return res.status(500).json({ error: "GOOGLE_SHEET_ID env var not set" });

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A2:F",
    });

    const rows = response.data.values || [];
    const trackers = rows
      .filter(r => r && r[0])
      .map(r => ({
        id:      r[0] || "",
        domain:  r[1] || "",
        keyword: r[2] || "",
        country: r[3] || "in",
        pos:     r[4] === "" || r[4] == null ? null : Number(r[4]),
        checked: r[5] || null,
      }));

    return res.status(200).json(trackers);
  } catch (err: any) {
    console.error("get-trackers error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 4. `/api/save-trackers`
app.post("/api/save-trackers", async (req, res) => {
  try {
    console.log("SAVE API HIT");
    const trackers = req.body;
    if (!Array.isArray(trackers)) {
      return res.status(400).json({ error: "Body must be an array of trackers" });
    }

    const clientEmail = cleanEnvVar(process.env.GOOGLE_CLIENT_EMAIL);
    const privateKey = cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY);
    const spreadsheetId = cleanSpreadsheetId(process.env.GOOGLE_SHEET_ID);

    if (!clientEmail)   return res.status(500).json({ error: "GOOGLE_CLIENT_EMAIL env var not set" });
    if (!privateKey)    return res.status(500).json({ error: "GOOGLE_PRIVATE_KEY env var not set" });
    if (!spreadsheetId) return res.status(500).json({ error: "GOOGLE_SHEET_ID env var not set" });

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    console.log("BEFORE CLEAR");
    
    // Clear existing data rows (keep header row 1)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "Sheet1!A2:F",
    });
    console.log("AFTER CLEAR");

    if (trackers.length > 0) {
      const values = trackers.map(t => [
        t.id      || "",
        t.domain  || "",
        t.keyword || "",
        t.country || "in",
        (t.pos === 0 || t.pos === null || t.pos === undefined) ? "" : String(t.pos),
        t.checked || "",
      ]);
      console.log("BEFORE UPDATE");
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A2",
        valueInputOption: "RAW",
        requestBody: { values },
      });
      console.log("AFTER UPDATE");
    }

    return res.status(200).json({ success: true, saved: trackers.length });
  } catch (err: any) {
    console.error("save-trackers error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Bootstrap standalone Express & Vite dev server (Bypassed in serverless environments like Vercel)
async function bootstrapServer() {
  const PORT = 3000;

  // Vite Integration & Static File Server Setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched successfully on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  bootstrapServer();
}

export default app;
