const ALLOWED_HOSTS = new Set([
  'moxie.foxnews.com', 'www.newsmax.com', 'www.breitbart.com', 'dailycaller.com',
  'www.washingtontimes.com', 'nypost.com', 'www.reuters.com', 'afs.google.com',
  'news.google.com', 'www.usatoday.com', 'axios.com', 'thehill.com',
  'www.cbsnews.com', 'feeds.nbcnews.com', 'feeds.abcnews.com', 'rss.cnn.com',
  'rss.nytimes.com', 'www.politico.com', 'feeds.bbci.co.uk', 'www.aljazeera.com',
  'timesofindia.indiatimes.com', 'techcrunch.com', 'www.theverge.com',
  'arstechnica.com', 'www.wired.com', 'www.engadget.com', 'rss.sciam.com',
  'www.nature.com', 'www.science.org', 'news.yahoo.com',
  'rss.upi.com', 'www.oddee.com', 'feeds.apnews.com'
]);

const FETCH_TIMEOUT = 6000;
const CACHE_TTL = 300_000; // 5 minutes
const cache = new Map();

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = decodeEntities(
      block.match(/<title[^>]*?>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() || ''
    );
    const linkMatch = block.match(/<link[^>]*href="([^"]*)"/) ||
                      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const link = (linkMatch?.[1] || linkMatch?.[2] || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const pubDate = block.match(
      /<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i
    )?.[1]?.trim() || '';
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

async function fetchOneFeed(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.items;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'StelliumReport/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = parseRSS(xml);
  cache.set(url, { items, time: Date.now() });
  return items;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { feeds } = body;
  if (!Array.isArray(feeds) || feeds.length === 0 || feeds.length > 60) {
    return new Response(JSON.stringify({ error: 'feeds array required (max 60)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  for (const f of feeds) {
    try {
      const parsed = new URL(f.url);
      if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const results = await Promise.allSettled(
    feeds.map(async (f) => ({
      name: f.name,
      items: await fetchOneFeed(f.url)
    }))
  );

  const response = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      response[r.value.name] = r.value.items;
    }
  }

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, max-age=120'
    }
  });
};
