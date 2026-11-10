// Capture today's built userscript on a real product page (iPhone) for the price-match/lowest-price
// and review reels: page before/after, the panel alone, an optional card tooltip, and (REVIEWS=1)
// the reviews section with the text «Kopier til AI» actually copies.
// node panel-capture.mjs <url> <video-name> <prefix>
//   COLLAPSE=chips,codes,offers  panel sections to fold (default chips,codes,offers)
//   REVIEWS=1                    fold the price match, open «Vurderinger», click «Kopier til AI»
//   TIP=<n>                      open the info tooltip of price-match card n (0-based)
//   SCROLLBY=<css px>            scroll the page further after its heading
//   WAIT=cards                   wait for any price-match row, not a lowest-price note (strøm, mobil)
// Assets, capture.json and capture.js (window.CAPTURES[prefix]) go to videos/<name>/assets.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(fileURLToPath(import.meta.url));
const [url, name, prefix] = process.argv.slice(2);
assert.ok(url && /^[a-z0-9-]+$/.test(name ?? '') && /^[a-z0-9-]+$/.test(prefix ?? ''), 'URL, video name and prefix required');
const reviews = process.env.REVIEWS === '1';
const tipIndex = process.env.TIP === undefined ? undefined : Number(process.env.TIP);
const collapse = (process.env.COLLAPSE ?? 'chips,codes,offers').split(',').filter(Boolean);
const assets = resolve(ROOT, 'videos', name, 'assets');
await mkdir(assets, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-blink-features=AutomationControlled'] });
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const requests = [];
  await context.exposeBinding('__reelFetch', async (_source, request) => {
    try {
      const response = await fetch(request.url, { method: request.method ?? 'GET', headers: request.headers,
        body: request.data, signal: AbortSignal.timeout(20000) });
      const responseText = await response.text();
      requests.push({ url: request.url.replace(/([?&](?:api_key|key|token)=)[^&]+/gi, '$1***'), status: response.status });
      return { status: response.status, responseText, finalUrl: response.url };
    } catch (error) {
      requests.push({ url: request.url, error: String(error) });
      return { status: 0, error: String(error) };
    }
  });
  await context.addInitScript(({ collapse, reviews }) => {
    const store = Object.fromEntries(collapse.map((key) => [`cashback-varsler-${key}-collapsed`, true]));
    if (reviews) { store['cashback-varsler-price-match-collapsed'] = true; store['cashback-varsler-reviews-collapsed'] = false; }
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // «Kopier til AI» writes here; the reel shows exactly this text.
    window.__copied = [];
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copied.push(text); } } }); } catch {}
    window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
    window.GM_setValue = (key, value) => { store[key] = value; };
    window.GM_xmlhttpRequest = request => {
      window.__reelFetch({ url: request.url, method: request.method, headers: request.headers, data: request.data }).then(result => {
        if (!result.status) { request.onerror?.(result); return; }
        let response = result.responseText;
        if (request.responseType === 'json') { try { response = JSON.parse(response); } catch { response = null; } }
        request.onload?.({ ...result, readyState: 4, response });
      });
      return { abort() {} };
    };
  }, { collapse, reviews });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(response.status(), 200, `Page must load successfully (HTTP ${response.status()})`);
  await page.waitForTimeout(3500);
  const dismissals = [];
  // Two passes: some consent banners (fjordkraft.no) appear a few seconds after load.
  for (let pass = 0; pass < 2; pass++) {
  if (pass === 1) await page.waitForTimeout(2500);
  for (let attempt = 0; attempt < 3; attempt++) {
    let clicked = false;
    for (const label of [/^(avvis alle|avslå alle|avvis|avslå|kun nødvendige|bare nødvendige|tillat nødvendige|reject all|reject|decline|deny|continue without accepting|fortsett uten)/i, /^(nei,?\s*takk!?|no,?\s*thanks!?|lukk)$/i]) {
      const button = page.getByRole('button', { name: label }).first();
      if (await button.isVisible().catch(() => false)) {
        // Hidden menus' «Lukk» buttons sit outside the viewport; skip what cannot be clicked.
        if (!await button.click({ timeout: 2000 }).then(() => true, () => false)) continue;
        dismissals.push(await button.innerText().catch(() => ''));
        await page.waitForTimeout(700);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // Some banners use links or divs, not buttons («AVVIS ALLE COOKIES» on fjordkraft.no).
      const text = page.getByText(/^\s*(avvis alle( cookies)?|kun nødvendige( cookies)?)\s*$/i).first();
      if (await text.isVisible().catch(() => false) && await text.click({ timeout: 2000 }).then(() => true, () => false)) {
        dismissals.push(await text.innerText().catch(() => ''));
        await page.waitForTimeout(700);
        continue;
      }
      break;
    }
  }
  }
  const heading = page.locator('h1').first();
  if (await heading.count()) { await heading.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -110)); await page.waitForTimeout(700); }
  // SCROLLBY=<css px> moves the page further, e.g. to put the price and «førpris» mid-screen.
  if (process.env.SCROLLBY) { await page.evaluate((y) => scrollBy(0, y), Number(process.env.SCROLLBY)); await page.waitForTimeout(700); }
  await page.screenshot({ path: resolve(assets, `${prefix}-before.png`) });
  await page.addScriptTag({ content: await readFile(resolve(ROOT, '../../site/cashback-varsler.user.js'), 'utf8') });
  const root = '#cashback-varsler-notice';
  // Wait until the price match has its lowest-price notes (or the reviews their rows) and stops changing.
  // WAIT=cards: any price-match row (electricity and mobile comparisons have no lowest-price note).
  const ready = reviews ? `${root} .reviews-section .price-match-card`
    : process.env.WAIT === 'cards' ? `${root} .price-match-section:not(.reviews-section) .price-match-card` : `${root} .price-match-card .price-match-history`;
  await page.locator(ready).first().waitFor({ state: 'attached', timeout: 90000 });
  let last = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const now = await page.locator(root).evaluate((host) => host.shadowRoot.textContent);
    if (now === last) break;
    last = now;
  }
  await page.mouse.move(2, 840);
  await page.screenshot({ path: resolve(assets, `${prefix}-after.png`) });
  const metadata = await page.evaluate(() => {
    const shadow = document.getElementById('cashback-varsler-notice').shadowRoot;
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(x => Math.round(x * 3)); };
    const text = el => el?.innerText?.trim() ?? '';
    const heading = document.querySelector('h1');
    return { title: document.title, heading: { text: text(heading), box: box(heading) },
      pagePrices: [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && /\d/.test(text(el)) && /(?:kr|,-)\s*$/.test(text(el)) && text(el).length < 24 && el.getBoundingClientRect().width > 0).map(el => ({ text: text(el), box: box(el) })),
      pageText: document.body.innerText.slice(0, 12000), panel: box(shadow.querySelector('section')),
      cards: [...shadow.querySelectorAll('.price-match-section:not(.reviews-section) .price-match-card')].map(card => ({ text: text(card), box: box(card),
        source: text(card.querySelector('.provider-badge')), price: text(card.querySelector('.price-match-price')), priceBox: box(card.querySelector('.price-match-price')),
        history: text(card.querySelector('.price-match-history')), historyTitle: card.querySelector('.price-match-history')?.title ?? '', historyBox: box(card.querySelector('.price-match-history')),
        info: box(card.querySelector('.cbn-tooltip-trigger') ?? card.parentElement.querySelector('.cbn-tooltip-trigger')), href: card.href })),
      reviews: [...shadow.querySelectorAll('.reviews-section .price-match-card')].map(row => ({ text: text(row), box: box(row), score: text(row.querySelector('.price-match-price:last-child, .review-score')), scoreBox: box(row.querySelector('.review-score') ?? row.querySelector('.price-match-price:last-child')) })),
      copy: box(shadow.querySelector('.reviews-copy')) };
  });
  const hidingStyle = await page.addStyleTag({ content: 'html,body { background:transparent!important } body * { visibility:hidden!important } #cashback-varsler-notice { visibility:visible!important }' });
  await page.screenshot({ path: resolve(assets, `${prefix}-panel.png`), omitBackground: true });
  await hidingStyle.evaluate(element => element.remove());
  if (tipIndex !== undefined) {
    const info = metadata.cards[tipIndex]?.info;
    assert.ok(info, `Card ${tipIndex} has an info button`);
    await page.touchscreen.tap((info[0] + info[2]) / 6, (info[1] + info[3]) / 6);
    const tooltip = page.locator(`${root} .cbn-tooltip-open`);
    await tooltip.waitFor({ state: 'visible' });
    const tooltipBox = await tooltip.boundingBox();
    assert.ok(tooltipBox.x >= 0 && tooltipBox.x + tooltipBox.width <= 393, 'Tooltip stays in viewport');
    await page.screenshot({ path: resolve(assets, `${prefix}-tip.png`) });
    metadata.tip = { text: await tooltip.innerText(), box: [tooltipBox.x, tooltipBox.y, tooltipBox.x + tooltipBox.width, tooltipBox.y + tooltipBox.height].map(x => Math.round(x * 3)) };
    await page.touchscreen.tap(380, 120);
    await page.waitForTimeout(400);
  }
  if (reviews && metadata.copy) {
    await page.touchscreen.tap((metadata.copy[0] + metadata.copy[2]) / 6, (metadata.copy[1] + metadata.copy[3]) / 6);
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(assets, `${prefix}-copied.png`) });
    metadata.copiedText = (await page.evaluate(() => window.__copied)).at(-1) ?? '';
    assert.ok(metadata.copiedText.includes('PRODUKT'), '«Kopier til AI» copied the prompt');
  }
  const file = resolve(assets, 'capture.json');
  const all = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {};
  all[prefix] = { url, finalUrl: page.url(), capturedAt: new Date().toISOString(), screenshotPx: [1179, 2556], dismissals, ...metadata, requests };
  await writeFile(file, JSON.stringify(all, null, 2) + '\n');
  const slim = Object.fromEntries(Object.entries(all).map(([key, value]) => [key, { heading: value.heading, pagePrices: value.pagePrices, panel: value.panel, cards: value.cards, reviews: value.reviews, copy: value.copy, tip: value.tip }]));
  await writeFile(resolve(assets, 'capture.js'), `window.CAPTURES = ${JSON.stringify(slim)};\n`);
  console.log(JSON.stringify({ prefix, finalUrl: page.url(), dismissals, heading: metadata.heading.text, prices: metadata.pagePrices.slice(0, 6).map((p) => p.text),
    cards: metadata.cards.map((card) => `${card.source}: ${card.price} | ${card.history} | ${card.historyTitle.slice(0, 90)}`), reviews: metadata.reviews.map((r) => r.text.replace(/\s+/g, ' ')),
    copied: metadata.copiedText?.slice(0, 200), tip: metadata.tip?.text.slice(0, 300) }, null, 2));
} finally { await browser.close(); }
