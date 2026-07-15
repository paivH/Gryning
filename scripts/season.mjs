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

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }

const prompt = `You write ONE short cooking idea for a Swedish kitchen dashboard.

Ingredient in season right now (${monthName}): ${ingredient}
The cook loves: ${STYLE}.

Write a single idea (max 22 words), in Swedish, using this ingredient. Favour one of their loved techniques when it fits the ingredient. Be specific and practical (a real technique or ratio), not generic. No preamble.

Respond ONLY with JSON, no markdown fences:
{"ingredient": "${ingredient}", "idea": "<your idea>"}`;

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
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.idea) throw new Error('No idea in response');

  writeFileSync('season.json', JSON.stringify({
    updated: now.toISOString(),
    ingredient: parsed.ingredient || ingredient,
    idea: parsed.idea,
  }, null, 1));
  console.log(`season.json: ${parsed.ingredient} — ${parsed.idea}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1); // keep yesterday's file rather than overwrite with junk
}
