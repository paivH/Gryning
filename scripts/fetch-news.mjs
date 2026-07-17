// scripts/fetch-news.mjs
// Fetches RSS feeds server-side and writes news.json to the repo root.
// Run by .github/workflows/news.yml every 30 minutes.

import { writeFileSync } from 'node:fs';

const FEEDS = [
  { name: 'BBC', section: 'Världen', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'SVT', section: 'Sverige · Stockholm', url: 'https://www.svt.se/nyheter/rss.xml' },
  { name: 'STHLM', section: 'Sverige · Stockholm', url: 'https://www.svt.se/nyheter/lokalt/stockholm/rss.xml' },
  { name: 'BBC', section: 'United', url: 'https://feeds.bbci.co.uk/sport/football/teams/manchester-united/rss.xml' },
];

const PER_FEED = 5;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .trim();

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const items = [];

for (const feed of FEEDS) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'user-agent': 'mytidning-dashboard (github actions)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, PER_FEED);
    const pick = (b, tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? decode(m[1]) : '';
    };
    for (const [, b] of blocks) {
      items.push({
        src: feed.name,
        section: feed.section,
        title: pick(b, 'title'),
        date: new Date(pick(b, 'pubDate')).toISOString(),
        link: pick(b, 'link'),
        desc: stripTags(pick(b, 'description')).slice(0, 500),
      });
    }
    console.log(`${feed.name}: ${blocks.length} items`);
  } catch (e) {
    console.error(`${feed.name} failed: ${e.message}`);
  }
}

writeFileSync(
  'news.json',
  JSON.stringify({ updated: new Date().toISOString(), items }, null, 1)
);
console.log(`wrote news.json with ${items.length} items`);
