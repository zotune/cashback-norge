// Start `python3 -m http.server 8765 -d site` first. These are deterministic
// catalogue fixtures; no source API requests or production votes are sent.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(new URL('../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/package.json', import.meta.url));
const { chromium } = require('playwright');
const output = new URL('../../dist/preview/grocery-stores/', import.meta.url).pathname;
await mkdir(output, { recursive: true });

const offer = (id, chain, validFrom, validTo) => ({ id, chain, dealer: chain, heading: id, description: '', amount: 10, validFrom, validTo });
const catalog = {
  version: 1, generatedAt: '2026-11-07T19:18:20Z', location: 'Oslo', chains: ['KIWI', 'Obs', 'Coop Mega'],
  offers: [
    offer('kiwi-current', 'KIWI', '2026-11-01T23:00:00Z', '2026-11-08T22:59:59Z'),
    offer('obs-saturday', 'Obs', '2026-11-01T23:00:00Z', '2026-11-07T22:59:59Z'),
    offer('mega-monday', 'Coop Mega', '2026-11-08T23:00:00Z', '2026-11-14T22:59:59Z'),
  ],
};
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, now, obsCount, megaCount] of [
    ['saturday', '2026-11-07T22:59:58Z', 1, 1],
    ['sunday', '2026-11-07T23:00:00Z', 0, 1],
    ['monday', '2026-11-08T23:00:00Z', 0, 1],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'nb-NO', colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors = [], sourceRequests = [];
    let snapshot = catalog;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/tjek\.com|etilbudsavis\.no/.test(request.url())) sourceRequests.push(request.url()); });
    await page.addInitScript(time => { Date.now = () => time; }, Date.parse(now));
    await page.route('**/grocery-offers.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot) }));
    await page.route('**/cashback-index.json', route => route.fulfill({ contentType: 'application/json', body: '{"offers":[]}' }));
    await page.route('**/*.supabase.co/**', route => route.fulfill({ contentType: 'application/json', body: route.request().url().includes('my-votes') ? '{"votes":[]}' : '[]' }));
    await page.goto('http://localhost:8765/dagligvarer/?kjede=Obs');
    const groups = page.locator('[data-ol="groups"] [data-group]');
    const obs = page.locator('[data-group="Obs"]');
    await obs.waitFor();
    assert.equal(await groups.count(), await page.evaluate(() => window.SHARED.GROCERY_CHAIN_LIST.length));
    assert.equal(await obs.getAttribute('aria-pressed'), 'true', 'old direct shop links still select an empty shop');
    assert.equal((await obs.locator('.cbn-count').innerText()).trim(), String(obsCount));
    assert.equal((await page.locator('[data-group="Coop Mega"] .cbn-count').innerText()).trim(), String(megaCount));
    assert.equal((await page.locator('[data-group="oda"] .cbn-count').innerText()).trim(), '0', 'shops without any catalogue rows remain visible');
    if (obsCount === 0) {
      assert.match(await obs.getAttribute('title'), /Ingen aktive tilbud i den lagrede katalogen/);
      assert.match(await page.locator('.empty').innerText(), /Ingen aktive kundeavistilbud.*lagrede katalogen/);
      assert.equal(await page.locator('.deal-row').count(), 0);
    } else assert.equal(await page.locator('[data-id="obs-saturday"]').count(), 1);

    await page.locator('[data-ol="none"]').click();
    assert.match(await page.locator('.empty').innerText(), /Velg minst én butikk/);
    await page.reload();
    await page.locator('.empty').filter({ hasText: 'Velg minst én butikk' }).waitFor();
    await page.locator('[data-ol="all"]').click();
    assert.equal(await page.locator('[data-ol="groups"] [data-group][aria-pressed="false"]').count(), 0);
    assert.equal(await page.locator('[data-id="obs-saturday"]').count(), obsCount);
    assert.equal(await page.locator('[data-id="mega-monday"]').count(), megaCount);
    if (name !== 'monday') assert.match(await page.locator('[data-id="mega-monday"] .days-left--upcoming').innerText(), /Fra 9\. nov/);
    else assert.equal(await page.locator('[data-id="mega-monday"] .days-left--upcoming').count(), 0);
    assert.equal(await page.locator('[data-group="Obs"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 73, 147)');

    if (name === 'sunday') {
      // A new daily snapshot brings back the real current offers; future/expired
      // entries in the old snapshot are distinguished from current prices.
      snapshot = { ...catalog, generatedAt: '2026-11-08T00:01:00Z', offers: [offer('obs-sunday', 'Obs', '2026-11-07T23:00:00Z', '2026-11-14T22:59:59Z')] };
      await page.reload();
      await page.locator('[data-id="obs-sunday"]').waitFor();
      assert.equal((await obs.locator('.cbn-count').innerText()).trim(), '1');
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (width <= 390) assert.ok(await page.locator('[data-ol="groups"]').evaluate(el => el.scrollWidth > el.clientWidth), 'shop chips scroll horizontally on phones');
        await obs.scrollIntoViewIfNeeded();
        assert.equal(await obs.isVisible(), true);
      }
      await page.screenshot({ path: `${output}/mobile.png` });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(sourceRequests, [], 'the page reads our snapshot, not the upstream API');
    await page.close();
  }
  console.log('PASS: shop chips persist across Oslo midnight, zero-count explanations, upcoming offers labelled, expired offers hidden, fresh snapshots, saved selection and mobile scrolling.');
} finally { await browser.close(); }
