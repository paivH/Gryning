// scripts/deals.mjs
// Asks Claude (with web search) to find current offers at stores around
// Barkarby handelsplats and writes deals.json. Run daily by the Action.
// Requires ANTHROPIC_API_KEY as a repo secret.

import { writeFileSync } from 'node:fs';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ERROR: ANTHROPIC_API_KEY is empty. Check the secret exists and is named exactly ANTHROPIC_API_KEY in repo Settings > Secrets and variables > Actions.');
  process.exit(1);
}
console.log(`Key present (length ${key.length}, starts ${key.slice(0, 7)}…).`);

const today = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

const prompt = `Today is ${today}. Find CURRENT weekly offers/deals (veckans erbjudanden) at these stores near Barkarby handelsplats in Järfälla, Sweden:

- Maxi ICA Stormarknad Barkarbystaden (ica.se store offer page)
- Lidl (Järfälla/Veddesta — Lidl Sverige weekly offers, lidl.se)
- IKEA Barkarby (current campaign/lower price items, ikea.com/se)
- Stockholm Quality Outlet Barkarby / Plantagen / Rusta / Elgiganten Barkarby (any notable current campaign)

Search the web for each. Only include deals you actually found evidence for THIS week — never invent prices. Prefer groceries and concrete prices ("10 kr/kg tomater", "5 för 100 kr"). Aim for 4-6 deals across different stores; fewer is fine if that's what you can verify.

Respond ONLY with JSON, no markdown fences, in exactly this shape:
{"deals": [{"store": "ICA", "item": "Tomater i lösvikt", "price": "10 kr/kg", "url": "https://www.ica.se/..."}, ...]}
Store must be a short label: ICA, Lidl, IKEA, Outlet, Plantagen, Rusta, Elgiganten.
For "url", give the best link you found for that deal or the store's offer page. If you have no URL, use the store's main site (e.g. https://www.ica.se). Never invent a specific product URL you didn't see.`;

try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`ERROR: Anthropic API returned ${res.status}.`);
    if (res.status === 400 && /credit|balance|billing/i.test(body)) {
      console.error('This looks like a billing/credit issue — add credit at console.anthropic.com > Billing.');
    }
    console.error('Full response:', body);
    process.exit(1);
  }
  const data = await res.json();

  // web search can FAIL while HTTP is still 200 — the error is embedded in the response
  const searchResults = (data.content || []).filter((b) => b.type === 'web_search_tool_result');
  for (const sr of searchResults) {
    const c = sr.content;
    if (c && c.type === 'web_search_tool_result_error') {
      console.error(`Web search failed: ${c.error_code}`);
      if (/not_enabled|permission|unauthorized/i.test(c.error_code || '')) {
        console.error('Web search may need enabling for your API workspace at console.anthropic.com. Falling back to model knowledge.');
      }
    }
  }
  console.log('stop_reason:', data.stop_reason, '| content block types:', (data.content || []).map((b) => b.type).join(', '));

  // find blocks by type, not position: text blocks carry the JSON
  const texts = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const raw = texts.join('\n');

  // extract JSON robustly: try fenced ```json first, then the LAST balanced {...}
  function extractJson(s) {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* keep trying */ } }
    // scan for the last top-level object that parses
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

  const parsed = extractJson(raw);
  if (!parsed || !parsed.deals) {
    console.error('Could not parse deals JSON from model response.');
    console.error('Raw text was:\n', raw.slice(0, 1500));
    process.exit(1);
  }
  const deals = (parsed.deals || []).filter((d) => d.store && d.item)
    .map((d) => ({ store: d.store, item: d.item, price: d.price || '', url: d.url || '' }))
    .slice(0, 6);
  if (!deals.length) throw new Error('No deals found');

  writeFileSync('deals.json', JSON.stringify({
    updated: new Date().toISOString(),
    deals,
  }, null, 1));
  console.log(`deals.json: ${deals.length} deals — ${deals.map((d) => d.store).join(', ')}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1); // keep yesterday's deals rather than write junk
}
