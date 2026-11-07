// Local built-site assertions. Start `python3 -m http.server 8765 -d site` first.
// Votes are intercepted; this never writes to the production vote service.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json', import.meta.url));
const { chromium } = require('playwright');
const output = new URL('../../dist/preview/offer-lists/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('../../site/grocery-offers.json', import.meta.url), 'utf8'));
const active = catalog.offers.filter(o => Date.parse(o.validTo) >= Date.now() && Date.parse(o.validFrom) <= Date.now());
const [a, b] = active;
assert.ok(a && b);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], locale: 'nb-NO' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let rateLimited = false;
let capped = false;
let writes = 0;
await page.route('**/*.supabase.co/**', async route => {
  const url = route.request().url();
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  let body;
  let status = 200;
  if (url.includes('/functions/v1/my-votes')) body = { votes: [] };
  else if (url.includes('/functions/v1/vote')) {
    writes++;
    body = rateLimited ? { rate_limited: true } : { ok: true, registered_id: 101, upvotes: capped ? 5 : 4, downvotes: 0, ...(capped ? { capped: true } : {}) };
    if (rateLimited) status = 429;
  } else body = [
    { id: 101, code: a.id.toUpperCase(), code_votes: [{ vote: 1 }, { vote: 1 }, { vote: 1 }] },
    { id: 102, code: b.id.toUpperCase(), code_votes: [{ vote: 1 }, { vote: 1 }, { vote: 1 }, { vote: 1 }, { vote: -1 }, { vote: -1 }, { vote: -1 }, { vote: -1 }] },
  ];
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
});
await page.addInitScript(() => { Math.random = () => 0.1; });
const goto = async path => { await page.goto(`http://localhost:8765${path}`); await page.locator(path === '/' ? '.merchant' : '.deal-row').first().waitFor(); };
const chooseSort = async value => {
  await page.locator('[data-ol="sort"]').click();
  await page.locator(`.choice-menu [data-value="${value}"]`).click();
};
const noOverflow = async () => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'document overflows');
  assert.ok(await page.locator('.deal-row').evaluateAll(rows => rows.every(row => { const bounds = row.getBoundingClientRect(); return [...row.querySelectorAll('.deal-thumb, .deal-main, .deal-side, .deal-details, .deal-meta, .deal-meta > *, .deal-price')].every(el => { const r = el.getBoundingClientRect(); return r.left >= bounds.left - 1 && r.right <= bounds.right + 1; }); })), 'offer content overflows');
};
try {
  await goto('/dagligvarer/');
  assert.ok(await page.locator('.group-toggle').count() > 10);
  assert.equal(await page.locator('.group-toggle[aria-pressed="false"]').count(), 0);
  await page.locator('[data-ol="none"]').click();
  assert.match(await page.locator('.empty').innerText(), /Velg minst/);
  await page.reload();
  await page.locator('.empty').filter({ hasText: 'Velg minst' }).waitFor();
  await page.locator('[data-ol="all"]').click();
  await chooseSort('votes');
  await page.waitForFunction(id => document.querySelector('.deal-row')?.dataset.id === id, a.id);
  const first = page.locator('.deal-row').first();
  assert.equal(await page.locator('th[data-sort="votes"]').getAttribute('aria-sort'), 'descending');
  assert.equal(await first.locator('.deal-vote-cell [data-vote="1"] .vote-count').textContent(), '3');
  assert.equal(await page.locator('th[data-sort="votes"]').evaluate(el => getComputedStyle(el).textAlign), 'right');
  rateLimited = true;
  await first.locator('[data-vote="1"]').click();
  await first.locator('.rate-limit-msg').waitFor();
  assert.equal(await first.locator('.voted').count(), 0);
  assert.equal(await first.locator('[data-vote="1"] .vote-count').textContent(), '3');
  rateLimited = false;
  capped = true;
  await first.locator('[data-vote="1"]').click();
  assert.match(await first.locator('.rate-limit-msg').innerText(), /5/);
  assert.equal(await first.locator('.voted').count(), 0);
  capped = false;
  await chooseSort('name');
  await page.locator('[data-ol="az"]').waitFor({ state: 'visible' });
  await page.locator('[data-ol="az"] [data-letter="T"]').click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-ol="filter-toggle"]').click();
  await page.locator('[data-filter="maxPrice"]').fill('10');
  await page.waitForFunction(() => [...document.querySelectorAll('.deal-price')].every(el => Number(el.textContent.replace(/[^\d,]/g, '').replace(',', '.')) <= 10));
  await page.locator('[data-ol="filters-clear"]').click();
  await page.locator('[data-ol="filter-toggle"]').click();
  await page.locator('#card-bonus-toggle').click();
  await page.locator('#free-chips .badge-instabank').waitFor();
  assert.match(await page.locator('#free-chips .badge-instabank').locator('..').locator('..').getAttribute('href'), /oriomed\.com\/click\.track/);
  assert.equal(await page.locator('#free-chips .badge-instabank').locator('..').locator('..').getAttribute('rel'), 'sponsored noopener noreferrer');
  assert.ok(await page.locator('#premium-chips .bonus-chip').count() >= 3);
  assert.equal(await page.locator('.invite-card').evaluate(el => Math.round(el.getBoundingClientRect().width)), 422);
  assert.equal(await page.locator('.fixed-footer').evaluate(el => Math.round(el.getBoundingClientRect().width)), 1240);
  await page.locator('#card-bonus-toggle').click();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.locator('[data-view="table"]').click();
    await noOverflow();
    await page.screenshot({ path: `${output}/grocery-desktop-${colorScheme}.png` });
  }
  await page.locator('[data-ol="search"]').fill('ertestuing');
  await page.waitForFunction(() => location.search.includes('ertestuing'));
  await page.locator('.copy-btn').first().click();
  await page.waitForFunction(() => document.querySelector('.copy-btn .vote-tooltip')?.textContent === 'Tilbudet kopiert som bilde');
  const clipboard = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { types: item.types, bytes: Array.from(new Uint8Array(await (await item.getType('image/png')).arrayBuffer())) };
  });
  assert.deepEqual(clipboard.types, ['image/png']);
  assert.ok(clipboard.bytes.length > 5000);
  await writeFile(`${output}/copied-offer.png`, Buffer.from(clipboard.bytes));
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['list', 'grid']) {
      await page.locator(`[data-view="${view}"]`).click();
      await noOverflow();
      const metadata = await page.locator('.deal-meta--validity').first().evaluate(el => [...el.children].map(child => child.getBoundingClientRect().top));
      assert.ok(Math.abs(metadata[0] - metadata[1]) < 5, 'date and countdown must share a line');
      if (width === 390) await page.screenshot({ path: `${output}/grocery-mobile-${view}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('[data-ol="search"]').fill('kiwi');
  await page.waitForFunction(() => location.search.includes('kiwi'));
  await page.locator('.deal-row').first().evaluate(row => scrollTo(0, row.getBoundingClientRect().top + scrollY - document.querySelector('.sticky-header').offsetHeight - 12));
  await page.locator('.deal-row img').first().evaluate(img => img.decode().catch(() => {}));
  await page.locator('.deal-row').first().screenshot({ path: `${output}/grocery-kiwi-card.png` });
  await noOverflow();
  const meta = await page.locator('.deal-meta:not(.deal-meta--validity)').first().evaluate(el => [...el.children].map(child => child.getBoundingClientRect().top));
  assert.ok(Math.abs(meta[0] - meta[1]) < 5, 'shop and card bonus must share a line');
  await page.locator('[data-ol="search"]').fill('joker');
  await page.waitForFunction(() => location.search.includes('joker'));
  assert.ok(await page.locator('.badge-chain-joker').first().evaluate(el => ['rgb(255, 255, 255)', 'rgb(229, 229, 229)'].includes(getComputedStyle(el).color)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto('/dagens-tilbud/');
  assert.equal(await page.locator('h1').innerText(), 'Tilbud');
  assert.ok(await page.locator('.deal-desc').first().innerText().then(text => text.includes('Frakt ukjent')));
  await chooseSort('saving');
  assert.equal(await page.locator('th[data-sort="saving"]').getAttribute('aria-sort'), 'descending');
  await noOverflow();
  await page.locator('.deal-row img').first().evaluate(img => img.decode().catch(() => {}));
  await page.screenshot({ path: `${output}/deals-desktop.png` });
  await page.setViewportSize({ width: 390, height: 900 });
  await noOverflow();
  await page.screenshot({ path: `${output}/deals-mobile.png` });
  await goto('/');
  await page.locator('.merchant').first().waitFor();
  await page.locator('.bonus-toggle').click();
  await page.locator('.bonus-chips-portal .bonus-chip').first().waitFor({ state: 'visible' });
  await page.locator('.search').fill('kiwi');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent.includes(' av '));
  assert.match(await page.locator('.merchant').first().innerText(), /kiwi/i);
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop/mobile, filters, persistence, net votes, limits, bonus/affiliate rows, PNG clipboard, both offer lists and home. ${writes} mocked vote writes. Screenshots: ${output}`);
} finally { await browser.close(); }
