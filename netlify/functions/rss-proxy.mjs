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

export default async (req) => {
  const { searchParams } = new URL(req.url);
  const feedUrl = searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let parsed;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'StelliumReport/1.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream returned ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await res.text();
    return new Response(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, max-age=300'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch feed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
