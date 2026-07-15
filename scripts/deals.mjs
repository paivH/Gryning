// scripts/deals.mjs
// Generates a set of plausible current-week store offers for stores near
// Barkarby handelsplats and writes deals.json. NO web search (keeps cost ~0).
// Prices are ESTIMATES, flagged as such on the dashboard. Run daily by the Action.
// Requires ANTHROPIC_API_KEY as a repo secret.

import { writeFileSync } from 'node:fs';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ERROR: ANTHROPIC_API_KEY is empty. Check the secret name in repo Settings > Secrets and variables > Actions.');
  process.exit(1);
}
console.log(`Key present (length ${key.length}, starts ${key.slice(0, 7)}…).`);

const today = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const prompt = `Today is ${today}. Generate 5-6 realistic weekly offers typical for stores near Barkarby handelsplats, Järfälla, Sweden. These are ESTIMATES for a dashboard, not verified prices.

Mix these stores (short labels): ICA (groceries), Lidl (groceries), IKEA (home/food), Rusta (home/garden).
Use realistic Swedish prices and product names in Swedish. Vary items day to day (seasonal where sensible — it is ${today}). Prefer groceries.

Respond with ONLY a JSON object, no prose, no code fences:
{"deals":[{"store":"ICA","item":"Svenska tomater i lösvikt","price":"29 kr/kg","url":"https://www.ica.se"},{"store":"Lidl","item":"Kaffe Bellarom 500g","price":"29 kr","url":"https://www.lidl.se"}]}
For "url" use only the store's main site: https://www.ica.se, https://www.lidl.se, https://www.ikea.com/se/sv/, https://www.rusta.com/se.`;

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

try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`ERROR: Anthropic API returned ${res.status}.`);
    if (res.status === 400 && /credit|balance|billing/i.test(txt)) {
      console.error('Billing/credit issue — add credit at console.anthropic.com > Billing.');
    }
    console.error('Full response:', txt.slice(0, 400));
    process.exit(1);
  }
  const data = await res.json();
  console.log('stop_reason:', data.stop_reason);
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = extractJson(raw);
  const deals = (!parsed || !Array.isArray(parsed.deals)) ? [] : parsed.deals
    .filter((d) => d && d.store && d.item)
    .map((d) => ({ store: String(d.store), item: String(d.item), price: d.price || '', url: d.url || '' }))
    .slice(0, 6);
  if (!deals.length) { console.error('No deals parsed. Raw:\n', raw.slice(0, 800)); process.exit(1); }

  writeFileSync('deals.json', JSON.stringify({
    updated: new Date().toISOString(),
    verified: false,
    deals,
  }, null, 1));
  console.log(`deals.json: ${deals.length} estimated deals — ${deals.map((d) => d.store).join(', ')}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
}
