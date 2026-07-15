// scripts/deals.mjs
// Finds current offers at stores around Barkarby handelsplats and writes deals.json.
// Tries Claude WITH web search first; if that yields no usable JSON, retries WITHOUT
// web search (model knowledge) so the panel always refreshes. Run daily by the Action.
// Requires ANTHROPIC_API_KEY as a repo secret.

import { writeFileSync } from 'node:fs';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ERROR: ANTHROPIC_API_KEY is empty. Check the secret name in repo Settings > Secrets and variables > Actions.');
  process.exit(1);
}
console.log(`Key present (length ${key.length}, starts ${key.slice(0, 7)}…).`);

const today = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

const searchPrompt = `Today is ${today}. Search the web for CURRENT weekly offers (veckans erbjudanden) at stores near Barkarby handelsplats, Järfälla, Sweden:
- Maxi ICA Stormarknad Barkarbystaden (ica.se)
- Lidl Järfälla/Veddesta (lidl.se)
- IKEA Barkarby (ikea.com/se)
- Rusta / Plantagen / Elgiganten Barkarby, Stockholm Quality Outlet

Only include deals you found evidence for this week — never invent prices. Prefer groceries with concrete prices. Aim for 4-6 deals across stores.

After searching, respond with ONLY a JSON object (no prose, no code fences) in exactly this shape:
{"deals":[{"store":"ICA","item":"Tomater i lösvikt","price":"10 kr/kg","url":"https://www.ica.se/..."}]}
"store" is a short label (ICA, Lidl, IKEA, Rusta, Plantagen, Elgiganten, Outlet). For "url", use the deal link or the store's offer page; never invent a specific product URL you didn't see.`;

const noSearchPrompt = `List 4-6 plausible current-week grocery/store offers typical for stores near Barkarby handelsplats, Järfälla (Maxi ICA Barkarbystaden, Lidl, IKEA, Rusta). These are ESTIMATES, not verified.
Respond with ONLY a JSON object (no prose, no fences):
{"deals":[{"store":"ICA","item":"Kaffe Gevalia 450g","price":"39 kr","url":"https://www.ica.se"}]}
Use realistic Swedish prices and each store's main site as url.`;

function extractJson(s) {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* keep trying */ } }
  const starts = [];
  for (let i = 0; i < s.length; i++) if (s[i] === '{') starts.push(i);
  for (const start of starts) {
    let depth = 0;
    for (let j = start; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) {
        try { return JSON.parse(s.slice(start, j + 1)); } catch (e) { break; }
      } }
    }
  }
  return null;
}

async function callModel({ prompt, useSearch }) {
  const body = {
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 400 && /credit|balance|billing/i.test(txt)) {
      console.error('Billing/credit issue — add credit at console.anthropic.com > Billing.');
    }
    throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();

  // surface embedded web-search errors (HTTP stays 200 when a search fails)
  for (const b of (data.content || [])) {
    if (b.type === 'web_search_tool_result' && b.content && b.content.type === 'web_search_tool_result_error') {
      console.error(`Web search error: ${b.content.error_code}`);
    }
  }
  console.log(`[${useSearch ? 'search' : 'no-search'}] stop_reason=${data.stop_reason} blocks=${(data.content || []).map((b) => b.type).join(',')}`);

  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { parsed: extractJson(raw), raw };
}

function normalize(parsed) {
  if (!parsed || !Array.isArray(parsed.deals)) return [];
  return parsed.deals
    .filter((d) => d && d.store && d.item)
    .map((d) => ({ store: String(d.store), item: String(d.item), price: d.price || '', url: d.url || '' }))
    .slice(0, 6);
}

try {
  let deals = [];
  let verified = true;

  // attempt 1: with web search
  try {
    const r = await callModel({ prompt: searchPrompt, useSearch: true });
    deals = normalize(r.parsed);
    if (!deals.length) console.error('Search attempt produced no deals. Raw:\n', r.raw.slice(0, 800));
  } catch (e) {
    console.error('Search attempt failed:', e.message);
  }

  // attempt 2: fallback without web search
  if (!deals.length) {
    console.log('Falling back to no-search estimates…');
    const r = await callModel({ prompt: noSearchPrompt, useSearch: false });
    deals = normalize(r.parsed);
    verified = false;
    if (!deals.length) { console.error('Fallback also produced no deals. Raw:\n', r.raw.slice(0, 800)); process.exit(1); }
  }

  writeFileSync('deals.json', JSON.stringify({
    updated: new Date().toISOString(),
    verified,
    deals,
  }, null, 1));
  console.log(`deals.json: ${deals.length} deals (${verified ? 'verified via search' : 'estimated'}) — ${deals.map((d) => d.store).join(', ')}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
}
