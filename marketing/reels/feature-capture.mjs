// Capture the built userscript on a real page for a region-price or Pokepris reel.
// node feature-capture.mjs <url> <video-name> <region|pokepris>
// Assets and capture.json stay in the ignored videos/<video-name>/assets folder.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(fileURLToPath(import.meta.url));
const [url, name, feature] = process.argv.slice(2);
assert.ok(url && /^[a-z0-9-]+$/.test(name) && ['region', 'pokepris'].includes(feature), 'URL, video name and feature required');
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
      requests.push({ url: request.url, status: response.status });
      return { status: response.status, responseText, finalUrl: response.url };
    } catch (error) {
      requests.push({ url: request.url, error: String(error) });
      return { status: 0, error: String(error) };
    }
  });
  await context.addInitScript(() => {
    const store = { 'cashback-varsler-chips-collapsed': true, 'cashback-varsler-codes-collapsed': true };
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
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
  });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(response.status(), 200, 'Page must load successfully');
  await page.waitForTimeout(3500);
  const dismissals = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let clicked = false;
    for (const label of [/^(avvis alle|avslå alle|avvis|avslå|kun nødvendige|bare nødvendige|tillat nødvendige|reject all|reject|decline|deny|continue without accepting|fortsett uten)/i, /^(nei,?\s*takk!?|no,?\s*thanks!?|lukk)$/i]) {
      const button = page.getByRole('button', { name: label }).first();
      if (await button.isVisible().catch(() => false)) {
        dismissals.push(await button.innerText());
        await button.click();
        await page.waitForTimeout(700);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
  if (feature === 'pokepris') {
    const heading = page.locator('h1').first();
    await heading.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, -110));
    await page.waitForTimeout(700);
  }
  const declineNewsletter = async () => {
    const button = page.getByText(/^Nei,?\s*takk!?$/i).first();
    if (await button.isVisible().catch(() => false)) {
      const sideTab = page.locator('#cashback-varsler-notice .side-tab');
      const expanded = await page.locator('#cashback-varsler-notice .notice:not(.collapsed)').count() > 0;
      if (expanded) await sideTab.click();
      dismissals.push(await button.innerText());
      await button.click();
      await page.waitForTimeout(500);
      if (expanded) await sideTab.click();
    }
  };
  await declineNewsletter();
  await page.screenshot({ path: resolve(assets, 'before.png') });
  await page.addScriptTag({ content: await readFile(resolve(ROOT, '../../site/cashback-varsler.user.js'), 'utf8') });
  const selector = feature === 'region' ? '.region-price-card' : '.price-match-card:has(.provider-pokepris)';
  const cards = page.locator(`#cashback-varsler-notice ${selector}`);
  await cards.first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(6000);
  await declineNewsletter();
  for (const card of await cards.all()) {
    const layout = await card.evaluate(element => {
      const info = element.querySelector('.cbn-tooltip-trigger') ?? element.parentElement.querySelector('.cbn-tooltip-trigger');
      const badge = element.querySelector('.region-price-action, .provider-badge');
      const buttonBox = info?.getBoundingClientRect();
      const badgeBox = badge?.getBoundingClientRect();
      return { visible: info && getComputedStyle(info).display !== 'none',
        beforeBadge: buttonBox && badgeBox && buttonBox.right <= badgeBox.left,
        adjacent: buttonBox && badgeBox && badgeBox.left - buttonBox.right <= 12,
        sameLine: buttonBox && badgeBox && Math.abs(buttonBox.top + buttonBox.height / 2 - badgeBox.top - badgeBox.height / 2) < 1 };
    });
    assert.ok(layout.visible && layout.beforeBadge && layout.adjacent && layout.sameLine, `Info must be immediately left of its source chip: ${JSON.stringify(layout)}`);
  }
  await page.mouse.move(2, 840);
  await page.screenshot({ path: resolve(assets, 'after.png') });
  const metadata = await page.evaluate(({ selector }) => {
    const root = document.getElementById('cashback-varsler-notice').shadowRoot;
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(x => Math.round(x * 3)); };
    const text = el => el?.innerText?.trim() ?? '';
    const heading = document.querySelector('h1');
    return { title: document.title, heading: { text: text(heading), box: box(heading) },
      pagePrices: [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && /^\s*[\d.,\s]+\s*kr\s*$/.test(text(el)) && el.getBoundingClientRect().width > 0).map(el => ({ text: text(el), box: box(el) })),
      pageText: document.body.innerText.slice(0, 12000), panel: box(root.querySelector('section')),
      cards: [...root.querySelectorAll(selector)].map(card => ({ text: text(card), box: box(card),
        info: box(card.querySelector('.cbn-tooltip-trigger') ?? card.parentElement.querySelector('.cbn-tooltip-trigger')),
        href: card.href ?? card.querySelector('a')?.href })),
      allPriceMatches: [...root.querySelectorAll('.price-match-card')].map(card => ({ text: text(card), href: card.href })),
      tooltips: [...root.querySelectorAll('.offer-tooltip')].map(text) };
  }, { selector });
  const hidingStyle = await page.addStyleTag({ content: 'html,body { background:transparent!important } body * { visibility:hidden!important } #cashback-varsler-notice { visibility:visible!important }' });
  await page.screenshot({ path: resolve(assets, 'panel.png'), omitBackground: true });
  await hidingStyle.evaluate(element => element.remove());
  const target = cards.first();
  const button = target.locator('.cbn-tooltip-trigger');
  if (await button.count()) await button.click();
  else {
    const info = metadata.cards[0].info;
    await page.touchscreen.tap((info[0] + info[2]) / 6, (info[1] + info[3]) / 6);
  }
  const tooltip = page.locator('#cashback-varsler-notice .cbn-tooltip-open');
  await tooltip.waitFor({ state: 'visible' });
  const tooltipBox = await tooltip.boundingBox();
  assert.ok(tooltipBox.x >= 0 && tooltipBox.x + tooltipBox.width <= 393, 'Tooltip stays in viewport');
  assert.match(await tooltip.innerText(), feature === 'region' ? /AppStorePrice/ : /Pokepris/);
  await page.screenshot({ path: resolve(assets, 'tip.png') });
  metadata.tip = { text: await tooltip.innerText(), box: [tooltipBox.x, tooltipBox.y, tooltipBox.x + tooltipBox.width, tooltipBox.y + tooltipBox.height].map(x => Math.round(x * 3)) };
  const capture = { url, finalUrl: page.url(), capturedAt: new Date().toISOString(), feature,
    screenshotPx: [1179, 2556], dismissals, ...metadata, requests };
  await writeFile(resolve(assets, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await writeFile(resolve(assets, 'capture.js'), `window.CAPTURE = ${JSON.stringify({ heading: metadata.heading, pagePrices: metadata.pagePrices, panel: metadata.panel, cards: metadata.cards, tip: metadata.tip })};\n`);
  console.log(JSON.stringify({ name, finalUrl: page.url(), dismissals, cards: metadata.cards.slice(0, 3), tip: metadata.tip, assets }, null, 2));
} finally { await browser.close(); }
