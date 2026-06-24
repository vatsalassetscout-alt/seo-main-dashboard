import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import path from "path";
import axios from "axios";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";

function cleanPrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  
  // Strip outer quotes if present (double or single quotes)
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  
  // Replace escaped newlines with actual newlines
  key = key.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  
  // Extract strictly the BEGIN and END block if they exist
  const startMarker = "-----BEGIN PRIVATE KEY-----";
  const endMarker = "-----END PRIVATE KEY-----";
  
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON payloads
  app.use(express.json());

  // 1. Check current backend sheet configurability endpoints
  app.get("/api/config-status", (req, res) => {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    const leadsClientEmail = process.env.GOOGLE_LEADS_CLIENT_EMAIL || clientEmail;
    const leadsPrivateKey = process.env.GOOGLE_LEADS_PRIVATE_KEY || privateKey;
    const leadsSpreadsheetId = process.env.GOOGLE_LEADS_SHEET_ID;

    // Diagnose the key structure safely
    const rawKey = privateKey || "";
    const cleanedKey = cleanPrivateKey(rawKey);

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
      leadsClientEmail: leadsClientEmail || null,
      
      // Safe diagnostics for private key format (not exposing secret content)
      keyDiagnostics: {
        rawLength: rawKey.length,
        cleanedLength: cleanedKey.length,
        rawStartsWith: rawKey.substring(0, 30),
        rawEndsWith: rawKey.substring(Math.max(0, rawKey.length - 30)),
        cleanedStartsWith: cleanedKey.substring(0, 30),
        cleanedEndsWith: cleanedKey.substring(Math.max(0, cleanedKey.length - 30)),
        hasBeginMarker: cleanedKey.includes("-----BEGIN PRIVATE KEY-----"),
        hasEndMarker: cleanedKey.includes("-----END PRIVATE KEY-----"),
        rawNewlinesCount: (rawKey.match(/\n/g) || []).length,
        rawEscapedNewlinesCount: (rawKey.match(/\\n/g) || []).length,
        cleanedNewlinesCount: (cleanedKey.match(/\n/g) || []).length
      }
    });
  });

  // 2. `/api/check-rank`
  app.post("/api/check-rank", async (req, res) => {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
      const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_SHEET_ID;

      if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
        return res.status(400).json({
          error: "Google credentials are not configured in environment backend variables."
        });
      }

      // Handle quote wrapping and escaped newlines correctly 
      const privateKey = cleanPrivateKey(rawPrivateKey);

      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });

      const sheets = google.sheets({ version: "v4", auth });

      // Fetch spreadsheet tab sheets dynamically (avoid hardcoding Sheet1)
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetName = meta.data.sheets?.[0]?.properties?.title || "Sheet1";

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:F`
      });

      const rows = response.data.values || [];
      const trackers = rows
        .filter((r) => r && r[0])
        .map((r) => ({
          id: r[0] || "",
          domain: r[1] || "",
          keyword: r[2] || "",
          country: r[3] || "in",
          pos: r[4] === "" || r[4] == null ? null : Number(r[4]),
          checked: r[5] || null
        }));

      res.status(200).json(trackers);
    } catch (err: any) {
      console.error("get-trackers error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. `/api/save-trackers`
  app.post("/api/save-trackers", async (req, res) => {
    try {
      const trackers = req.body;
      if (!Array.isArray(trackers)) {
        return res.status(400).json({ error: "Body must be an array of trackers" });
      }

      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
      const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_SHEET_ID;

      if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
        return res.status(400).json({
          error: "Google credentials are not configured in environment backend variables."
        });
      }

      // Handle quote wrapping and escaped newlines correctly
      const privateKey = cleanPrivateKey(rawPrivateKey);

      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });

      const sheets = google.sheets({ version: "v4", auth });

      // Fetch spreadsheet tab sheets dynamically (avoid hardcoding Sheet1)
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetName = meta.data.sheets?.[0]?.properties?.title || "Sheet1";

      // Clear existing values (keep headers row 1)
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:F`
      });

      if (trackers.length > 0) {
        const values = trackers.map((t) => [
          t.id || "",
          t.domain || "",
          t.keyword || "",
          t.country || "in",
          t.pos === 0 || t.pos === null || t.pos === undefined ? "" : String(t.pos),
          t.checked || ""
        ]);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A2`,
          valueInputOption: "RAW",
          requestBody: { values }
        });
      }

      res.status(200).json({ success: true, saved: trackers.length });
    } catch (err: any) {
      console.error("save-trackers error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

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

startServer();
