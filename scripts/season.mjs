// scripts/season.mjs
// Picks a Swedish in-season ingredient and asks Claude for a cooking idea
// in Paiv's style, then writes season.json. Run daily by the Action.
// Requires ANTHROPIC_API_KEY as a repo secret.

import { writeFileSync } from 'node:fs';

// Swedish harvest seasons by month (0=Jan). Keep in sync with index.html SEASON.
const SEASON = {
  0:  ['grönkål', 'palsternacka', 'kål', 'rotselleri', 'morötter', 'lök', 'äpplen'],
  1:  ['grönkål', 'palsternacka', 'jordärtskocka', 'kålrot', 'morötter', 'lök'],
  2:  ['vitkål', 'morötter', 'lök', 'palsternacka', 'rotselleri'],
  3:  ['sparris', 'rabarber', 'salladskål', 'vitkål', 'späda blad'],
  4:  ['sparris', 'rabarber', 'färskpotatis', 'rädisor', 'salladslök'],
  5:  ['färskpotatis', 'jordgubbar', 'dill', 'sallad', 'broccoli', 'blomkål', 'rödbetor'],
  6:  ['gurka', 'chili', 'squash', 'fänkål', 'purjolök', 'bönor', 'ärtor', 'hallon', 'blåbär', 'kantareller'],
  7:  ['tomater', 'majs', 'squash', 'chili', 'grönkål', 'kålrot', 'plommon', 'päron', 'äpplen', 'kantareller'],
  8:  ['äpplen', 'päron', 'pumpa', 'svamp', 'rödbetor', 'purjolök', 'jordärtskocka', 'kål'],
  9:  ['pumpa', 'äpplen', 'kål', 'rotfrukter', 'morötter', 'svartrot', 'brysselkål'],
  10: ['grönkål', 'brysselkål', 'kålrot', 'palsternacka', 'lök', 'äpplen', 'pumpa'],
  11: ['grönkål', 'brysselkål', 'rödkål', 'rotselleri', 'palsternacka', 'lök', 'vinteräpplen'],
};

const STYLE = 'pickling, fermenting, bread baking, and quick weeknight dishes';

const now = new Date();
const list = SEASON[now.getMonth()];
const day = Math.floor(Date.now() / 86400000);
const ingredient = list[day % list.length];
const monthName = now.toLocaleDateString('sv-SE', { month: 'long' });

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

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ERROR: ANTHROPIC_API_KEY is empty. Check the secret exists and is named exactly ANTHROPIC_API_KEY in repo Settings > Secrets and variables > Actions.');
  process.exit(1);
}
console.log(`Key present (length ${key.length}, starts ${key.slice(0, 7)}…). Ingredient: ${ingredient}`);

const prompt = `You write short cooking ideas for a Swedish kitchen dashboard.

Ingredients in season right now (${monthName}) in Sweden: ${list.join(', ')}.
The cook loves: ${STYLE}.

Pick 4 DIFFERENT ingredients from the list (start with ${ingredient}) and write one idea for each (max 22 words, in Swedish). Favour their loved techniques where they fit. Be specific and practical (a real technique or ratio), not generic. Vary the techniques across the four.

Output requirements: respond with a raw JSON object and NOTHING else. No preamble, no explanation, no markdown code fences. The first character of your reply must be { and the last must be }.
{"items":[{"ingredient":"${ingredient}","idea":"<idea>"},{"ingredient":"<other>","idea":"<idea>"},{"ingredient":"<other>","idea":"<idea>"},{"ingredient":"<other>","idea":"<idea>"}]}`;

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
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
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
  console.log('stop_reason:', data.stop_reason);
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const parsed = extractJson(text);
  if (!parsed) {
    console.error('Could not parse JSON from model response. stop_reason:', data.stop_reason);
    console.error('Raw text was:\n', text.slice(0, 1200));
    process.exit(1);
  }
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .filter((i) => i && i.ingredient && i.idea).slice(0, 4);
  if (!items.length) throw new Error('No items in response');

  writeFileSync('season.json', JSON.stringify({
    updated: now.toISOString(),
    items,
  }, null, 1));
  console.log(`season.json: ${items.length} ideas — ${items.map((i) => i.ingredient).join(', ')}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1); // keep yesterday's file rather than overwrite with junk
}
