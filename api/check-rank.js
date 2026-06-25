import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeYahoo(keyword, country) {
  const urls = [];
  try {
    const c = (country || 'us').toLowerCase().trim();
    let host = 'search.yahoo.com';
    if (c === 'in') host = 'in.search.yahoo.com';
    else if (c === 'gb' || c === 'uk') host = 'uk.search.yahoo.com';
    else if (c === 'ca') host = 'ca.search.yahoo.com';
    else if (c === 'au') host = 'au.search.yahoo.com';
    else if (c === 'de') host = 'de.search.yahoo.com';
    else if (c === 'fr') host = 'fr.search.yahoo.com';

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          },
          timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          if (href.includes('RU=')) {
            const idx = href.indexOf('RU=');
            if (idx !== -1) {
              const part = href.substring(idx + 3);
              const nextSlash = part.indexOf('/');
              const rawUrl = nextSlash !== -1 ? part.substring(0, nextSlash) : part;
              try {
                const decoded = decodeURIComponent(rawUrl);
                if (
                  decoded.startsWith('http') &&
                  !decoded.includes('yahoo') &&
                  !decoded.includes('bing.com/aclick') &&
                  !decoded.includes('bing.com/click') &&
                  !decoded.includes('google.com')
                ) {
                  if (!urls.includes(decoded)) {
                    urls.push(decoded);
                  }
                }
              } catch (e) {}
            }
          } else if (
            href.startsWith('http') &&
            !href.includes('yahoo') &&
            !href.includes('yimg.com') &&
            !href.includes('bing.com') &&
            !href.includes('google.com')
          ) {
            if (!urls.includes(href)) {
              urls.push(href);
            }
          }
        });
      } catch (err) {
        console.error(`Yahoo page ${page + 1} scrape failed:`, err.message);
      }

      // Delay between page requests to avoid Yahoo detection blocks
      if (page < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Yahoo scrape failed:', error.message);
  }
  return urls;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  const { apiKey, keyword, country = 'in', domain } = req.body || {};

  if (!keyword || !domain) {
    return res.status(400).json({
      error: 'Missing required fields: keyword, domain',
    });
  }

  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  try {
    let position = -1;
    let totalResults = null;
    let usedEngine = 'Google (Organic Scraper)';

    // Step A: If SerpAPI key is provided, try that first for high-accuracy premium results
    if (apiKey && apiKey.trim().length > 0) {
      console.log(`SerpAPI Key provided. Attempting premium scan for: "${keyword}"...`);
      const MAX_PAGES = 5; 
      const fetchPromises = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const startOffset = page * 10;
        
        const promise = axios.get('https://serpapi.com/search.json', {
          params: { 
            q: keyword, 
            gl: country, 
            hl: 'en', 
            start: startOffset, 
            api_key: apiKey 
          },
          timeout: 12000, 
          headers: { Accept: 'application/json', 'User-Agent': 'RankPulse/1.0' },
        }).then(response => ({ page, data: response.data })).catch(err => ({ page, error: err }));
        
        fetchPromises.push(promise);
      }

      const responses = await Promise.all(fetchPromises);
      responses.sort((a, b) => a.page - b.page);

      let domainFound = false;
      for (const response of responses) {
        if (response.error || !response.data) continue;
        
        const data = response.data;
        if (data.error) {
          console.warn('SerpAPI error returned:', data.error);
          continue; // Fallback to organic parser
        }

        if (response.page === 0) {
          totalResults = data.search_information?.total_results ?? null;
        }

        const organicResults = data.organic_results;
        if (Array.isArray(organicResults) && organicResults.length > 0) {
          for (let i = 0; i < organicResults.length; i++) {
            const link = organicResults[i].link || '';
            const rd = link.toLowerCase()
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .split('/')[0];
              
            if (
              rd === cleanDomain ||
              rd === `www.${cleanDomain}` ||
              cleanDomain === `www.${rd}` ||
              rd.endsWith(`.${cleanDomain}`)
            ) {
              position = organicResults[i].position || (response.page * 10 + i + 1);
              domainFound = true;
              usedEngine = 'SerpAPI';
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
          checkedAt: new Date().toISOString(),
        });
      }
    }

    // Step B: Organic scraping (Free / zero cost) fallback
    console.log(`Running zero-cost organic parser for keyword: "${keyword}"...`);
    const urls = await scrapeYahoo(keyword, country);
    usedEngine = 'Yahoo (Organic Scraper)';

    console.log(`Extracted ${urls.length} URLs using ${usedEngine}`);

    for (let i = 0; i < urls.length; i++) {
      const link = urls[i];
      const rd = link.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];

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

    return res.status(200).json({
      success: true,
      position,
      keyword,
      domain: cleanDomain,
      country,
      totalResults: urls.length,
      usedEngine,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Try again.' });
    }
    return res.status(500).json({ error: err.message });
  }
}
