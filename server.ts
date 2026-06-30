import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import path from "path";
import axios from "axios";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

function cleanPrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return "";
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
  if (key.startsWith("{") || key.includes('"private_key"')) {
    try {
      const startBrace = key.indexOf("{");
      const endBrace = key.lastIndexOf("}");
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
        const startBrace = unescaped.indexOf("{");
        const endBrace = unescaped.lastIndexOf("}");
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
  key = key.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  
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
      
      // Keep only valid Base64 characters (remove spaces, newlines, etc.)
      body = body.replace(/[^A-Za-z0-9+/=]/g, "");
      
      // Chunk body into 64-character lines for strict PEM formatting expected by OpenSSL 3.0
      const chunks: string[] = [];
      for (let i = 0; i < body.length; i += 64) {
        chunks.push(body.substring(i, i + 64));
      }
      
      return `${startMarker}\n${chunks.join("\n")}\n${endMarker}\n`;
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

    const gscClientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || clientEmail;
    const gscPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || privateKey;
    const gscSpreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || spreadsheetId;

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
      gscConfigured: !!(gscClientEmail && gscPrivateKey && gscSpreadsheetId),
      hasGscSpecificEmail: !!process.env.GOOGLE_GSC_CLIENT_EMAIL,
      hasGscSpecificKey: !!process.env.GOOGLE_GSC_PRIVATE_KEY,
      gscSheetId: gscSpreadsheetId || null,
      gscClientEmail: gscClientEmail || null,
      
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

  // Helper functions for zero-cost organic scraping
  async function scrapeYahoo(keyword: string, country?: string): Promise<string[]> {
    const urls: string[] = [];
    try {
      const c = (country || "us").toLowerCase().trim();
      let host = "search.yahoo.com";
      if (c === "in") host = "in.search.yahoo.com";
      else if (c === "gb" || c === "uk") host = "uk.search.yahoo.com";
      else if (c === "ca") host = "ca.search.yahoo.com";
      else if (c === "au") host = "au.search.yahoo.com";
      else if (c === "de") host = "de.search.yahoo.com";
      else if (c === "fr") host = "fr.search.yahoo.com";

      // Fetch up to 3 pages of Yahoo results (positions 1-30) for high coverage
      for (let page = 0; page < 3; page++) {
        let url = `https://${host}/search?p=${encodeURIComponent(keyword)}`;
        if (page > 0) {
          const bValue = page * 10 + 1; // Page 2: 11, Page 3: 21
          url += `&b=${bValue}`;
        }
        
        try {
          const response = await axios.get(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            },
            timeout: 10000
          });
          
          const $ = cheerio.load(response.data);
          $("a").each((_, el) => {
            const href = $(el).attr("href") || "";
            if (href.includes("RU=")) {
              const idx = href.indexOf("RU=");
              if (idx !== -1) {
                const part = href.substring(idx + 3);
                const nextSlash = part.indexOf("/");
                const rawUrl = nextSlash !== -1 ? part.substring(0, nextSlash) : part;
                try {
                  const decoded = decodeURIComponent(rawUrl);
                  if (
                    decoded.startsWith("http") &&
                    !decoded.includes("yahoo") &&
                    !decoded.includes("bing.com/aclick") &&
                    !decoded.includes("bing.com/click") &&
                    !decoded.includes("google.com")
                  ) {
                    if (!urls.includes(decoded)) {
                      urls.push(decoded);
                    }
                  }
                } catch (e) {}
              }
            } else if (
              href.startsWith("http") &&
              !href.includes("yahoo") &&
              !href.includes("yimg.com") &&
              !href.includes("bing.com") &&
              !href.includes("google.com")
            ) {
              if (!urls.includes(href)) {
                urls.push(href);
              }
            }
          });
        } catch (err: any) {
          console.log(`Yahoo page ${page + 1} scrape notice (will fallback):`, err.message);
        }

        // Delay between page requests to avoid Yahoo detection blocks
        if (page < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error: any) {
      console.log("Yahoo scrape notice (will fallback):", error.message);
    }
    return urls;
  }

  async function scrapeDuckDuckGo(keyword: string): Promise<string[]> {
    const urls: string[] = [];
    try {
      const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 8000
      });
      
      const $ = cheerio.load(response.data);
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.includes("uddg=")) {
          const match = href.match(/[?&]uddg=([^&]+)/);
          if (match && match[1]) {
            try {
              const decoded = decodeURIComponent(match[1]);
              if (decoded.startsWith("http") && !decoded.includes("duckduckgo.com")) {
                if (!urls.includes(decoded)) {
                  urls.push(decoded);
                }
              }
            } catch (e) {}
          }
        } else if (
          href.startsWith("http") &&
          !href.includes("duckduckgo.com") &&
          !href.includes("google.com") &&
          !href.includes("yahoo.com") &&
          !href.includes("bing.com")
        ) {
          if (!urls.includes(href)) {
            urls.push(href);
          }
        }
      });
    } catch (error: any) {
      console.log("DuckDuckGo scrape notice:", error.message);
    }
    return urls;
  }

  // 2. `/api/check-rank`
  app.post("/api/check-rank", async (req, res) => {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const { apiKey, keyword, country = "in", domain } = req.body || {};

    if (!keyword || !domain) {
      return res.status(400).json({
        error: "Missing required fields: keyword, domain"
      });
    }

    const cleanDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    try {
      let position = -1;
      let totalResults = null;
      let usedEngine = "Google (Organic Scraper)";

      // Step A: If SerpAPI key is provided, try that first for high-accuracy premium results
      if (apiKey && apiKey.trim().length > 0) {
        console.log(`SerpAPI Key provided. Attempting premium scan for: "${keyword}"...`);
        const MAX_PAGES = 5;
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

        const responses = await Promise.all(fetchPromises);
        responses.sort((a, b) => a.page - b.page);

        let domainFound = false;
        let serpApiErrorMsg = "";

        for (const response of responses) {
          if (response.error) {
            const errObj = response.error as any;
            serpApiErrorMsg = errObj.response?.data?.error || errObj.message || "Network timeout or error connecting to SerpAPI";
            continue;
          }
          if (!response.data) continue;

          const data = response.data;
          if (data.error) {
            console.warn("SerpAPI error returned:", data.error);
            serpApiErrorMsg = data.error;
            continue;
          }

          if (response.page === 0) {
            totalResults = data.search_information?.total_results ?? null;
          }

          const organicResults = data.organic_results;
          if (Array.isArray(organicResults) && organicResults.length > 0) {
            for (let i = 0; i < organicResults.length; i++) {
              const item = organicResults[i];
              if (!item) continue;
              const link = item.link || "";
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
                position = item.position || response.page * 10 + i + 1;
                domainFound = true;
                usedEngine = "SerpAPI";
                break;
              }
            }
          }
          if (domainFound) break;
        }

        if (domainFound) {
          return res.status(200).json({
            success: true,
            position,
            keyword,
            domain: cleanDomain,
            country,
            totalResults,
            usedEngine,
            checkedAt: new Date().toISOString()
          });
        }

        // If SerpAPI completely failed on all pages, let the user know why instead of falling back silently
        const allFailed = responses.every(r => r.error || (r.data && r.data.error));
        if (allFailed && serpApiErrorMsg) {
          return res.status(400).json({
            error: `SerpAPI premium scan failed: ${serpApiErrorMsg}. Please verify your SerpAPI Key and account credits.`
          });
        }

        // SerpAPI was checked but the domain is not in the top 50 google search results
        return res.status(200).json({
          success: true,
          position: -1,
          keyword,
          domain: cleanDomain,
          country,
          totalResults,
          usedEngine: "SerpAPI (Google)",
          checkedAt: new Date().toISOString()
        });
      }

      // Step B: Organic scraping (Free / zero cost)
      console.log(`Running zero-cost organic parser for keyword: "${keyword}"...`);
      let urls: string[] = [];
      usedEngine = "Yahoo (Organic Scraper)";
      
      try {
        urls = await scrapeYahoo(keyword, country);
      } catch (e: any) {
        console.warn(`Yahoo scan failed: ${e.message}. Falling back to DuckDuckGo...`);
      }

      if (!urls || urls.length === 0) {
        console.log("Yahoo returned no results. Running DuckDuckGo search fallback...");
        try {
          urls = await scrapeDuckDuckGo(keyword);
          usedEngine = "DuckDuckGo (Organic Scraper)";
        } catch (e: any) {
          console.error("DuckDuckGo fallback also failed:", e.message);
        }
      }

      console.log(`Extracted ${urls.length} URLs using ${usedEngine}`);

      for (let i = 0; i < urls.length; i++) {
        const link = urls[i];
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
          position = i + 1;
          break;
        }
      }

      res.status(200).json({
        success: true,
        position,
        keyword,
        domain: cleanDomain,
        country,
        totalResults: urls.length,
        usedEngine,
        checkedAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GSC Dashboard Sheet Cache Endpoints
  app.get("/api/get-gsc-cache", async (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ error: "Missing start or end parameters" });
      }

      const clientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
      const rawPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || process.env.GOOGLE_SHEET_ID;

      if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
        return res.status(200).json({ found: false, message: "Google Sheets credentials not configured" });
      }

      const privateKey = cleanPrivateKey(rawPrivateKey);
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });

      const sheets = google.sheets({ version: "v4", auth });
      const cacheKey = `gsc_cache_${start}_${end}`;

      // 1. Fetch sites list from GSC_Sites_Db
      let siteRows: any[] = [];
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "GSC_Sites_Db!A2:I"
        });
        siteRows = response.data.values || [];
      } catch (e) {
        // Tab might not exist yet, treat as not cached
        return res.status(200).json({ found: false });
      }

      // Filter matching current DateRangeKey
      const filteredSiteRows = siteRows.filter(r => r && r[0] === cacheKey);
      if (filteredSiteRows.length === 0) {
        return res.status(200).json({ found: false });
      }

      // 2. Fetch series points from GSC_Series_Db
      let seriesRows: any[] = [];
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "GSC_Series_Db!A2:G"
        });
        seriesRows = response.data.values || [];
      } catch (e) {}

      const filteredSeriesRows = seriesRows.filter(r => r && r[0] === cacheKey);

      // Reconstruct final objects
      const allData = filteredSiteRows.map(r => ({
        url: r[1] || "",
        name: r[2] || "",
        type: (r[3] || "Domain") as "Domain" | "URL",
        clicks: Number(r[4]) || 0,
        impressions: Number(r[5]) || 0,
        ctr: Number(r[6]) || 0,
        position: Number(r[7]) || 0
      }));

      const timeSeries = filteredSeriesRows.map(r => ({
        date: r[1] || "",
        clicks: Number(r[2]) || 0,
        impressions: Number(r[3]) || 0,
        ctr: Number(r[4]) || 0,
        position: Number(r[5]) || 0
      }));

      res.status(200).json({
        found: true,
        data: { allData, timeSeries }
      });
    } catch (err: any) {
      console.error("get-gsc-cache error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/save-gsc-cache", async (req, res) => {
    try {
      const { start, end, data } = req.body;
      if (!start || !end || !data) {
        return res.status(400).json({ error: "Missing start, end, or data parameters" });
      }

      const clientEmail = process.env.GOOGLE_GSC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
      const rawPrivateKey = process.env.GOOGLE_GSC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
      const spreadsheetId = process.env.GOOGLE_GSC_SHEET_ID || process.env.GOOGLE_SHEET_ID;

      if (!clientEmail || !rawPrivateKey || !spreadsheetId) {
        return res.status(400).json({
          error: "Google credentials are not configured in environment backend variables."
        });
      }

      const privateKey = cleanPrivateKey(rawPrivateKey);
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });

      const sheets = google.sheets({ version: "v4", auth });
      const cacheKey = `gsc_cache_${start}_${end}`;
      const updatedAt = new Date().toISOString();

      // Ensure GSC_Sites_Db tab exists
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "GSC_Sites_Db" } } }]
          }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "GSC_Sites_Db!A1",
          valueInputOption: "RAW",
          requestBody: {
            values: [["DateRangeKey", "SiteUrl", "SiteName", "SiteType", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"]]
          }
        });
      } catch (e) {}

      // Ensure GSC_Series_Db tab exists
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "GSC_Series_Db" } } }]
          }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "GSC_Series_Db!A1",
          valueInputOption: "RAW",
          requestBody: {
            values: [["DateRangeKey", "Date", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"]]
          }
        });
      } catch (e) {}

      // 1. Process and save GSC_Sites_Db
      const sitesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "GSC_Sites_Db!A:I"
      });
      const sitesRows = sitesResponse.data.values || [];
      const sitesHeaders = sitesRows[0] || ["DateRangeKey", "SiteUrl", "SiteName", "SiteType", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"];
      const filteredSitesRows = sitesRows.slice(1).filter(row => row && row[0] !== cacheKey);

      const newSitesRows = (data.allData || []).map((site: any) => [
        cacheKey,
        site.url || "",
        site.name || "",
        site.type || "Domain",
        String(site.clicks || 0),
        String(site.impressions || 0),
        String(site.ctr || 0),
        String(site.position || 0),
        updatedAt
      ]);

      const finalSitesRows = [sitesHeaders, ...filteredSitesRows, ...newSitesRows];

      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: "GSC_Sites_Db!A:I"
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "GSC_Sites_Db!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: finalSitesRows
        }
      });

      // 2. Process and save GSC_Series_Db
      const seriesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "GSC_Series_Db!A:G"
      });
      const seriesRows = seriesResponse.data.values || [];
      const seriesHeaders = seriesRows[0] || ["DateRangeKey", "Date", "Clicks", "Impressions", "Ctr", "Position", "UpdatedAt"];
      const filteredSeriesRows = seriesRows.slice(1).filter(row => row && row[0] !== cacheKey);

      const newSeriesRows = (data.timeSeries || []).map((entry: any) => [
        cacheKey,
        entry.date || "",
        String(entry.clicks || 0),
        String(entry.impressions || 0),
        String(entry.ctr || 0),
        String(entry.position || 0),
        updatedAt
      ]);

      const finalSeriesRows = [seriesHeaders, ...filteredSeriesRows, ...newSeriesRows];

      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: "GSC_Series_Db!A:G"
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "GSC_Series_Db!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: finalSeriesRows
        }
      });

      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("save-gsc-cache error:", err.message);
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
