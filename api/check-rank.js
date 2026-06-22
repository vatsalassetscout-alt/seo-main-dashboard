const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { return res.status(405).json({ error: 'Method not allowed' }); }

  const { apiKey, keyword, country = 'in', domain } = req.body || {};

  if (!apiKey || !keyword || !domain) {
    return res.status(400).json({
      error: 'Missing required fields: apiKey, keyword, domain',
    });
  }

  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  // ⚙️ Define how deep you want to scan (5 pages = Top 50 results)
  const MAX_PAGES = 5; 

  try {
    // 1. Create an array of pending HTTP requests to execute concurrently
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
      }).then(res => ({ page, data: res.data })).catch(err => ({ page, error: err }));
      
      fetchPromises.push(promise);
    }

    // 2. Fire all SerpApi requests simultaneously
    const responses = await Promise.all(fetchPromises);

    // 3. Sort responses by page sequence order to evaluate positions correctly
    responses.sort((a, b) => a.page - b.page);

    let position = -1;
    let totalResults = null;
    let domainFound = false;

    // 4. Process the pages in correct ranking sequence
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
            // Extract global position directly from API metadata 
            position = organicResults[i].position || (response.page * 10 + i + 1);
            domainFound = true;
            break;
          }
        }
      }
      if (domainFound) break; 
    }

    return res.status(200).json({
      success: true,
      position,
      keyword,
      domain: cleanDomain,
      country,
      totalResults,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Try again.' });
    }
    return res.status(500).json({ error: err.message });
  }
};
