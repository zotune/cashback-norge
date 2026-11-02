// Capture the built userscript's flight price match on a real search page (iPhone 393x852 @3x).
//
//   [SCROLLY=px] node flight-capture.mjs '<url>' <video-name> <prefix> [tooltip-source] [max-wait-ms]
//
// Saves <prefix>-before.png (page), <prefix>-after.png (page + panel), <prefix>-panel.png (panel only),
// <prefix>-tip.png (tooltip of the tooltip-source row, e.g. finnreise) and merges the DOM boxes into
// videos/<video-name>/assets/capture.json and capture.js (window.CAPTURES[prefix]). Assets are ignored by git.
//
// The GM shim is the one from overlay-flights.mjs: requests go through the browser context's cookie jar
// with a browser User-Agent, which momondo needs. The capture waits until no row is "updating" (the FINN
// date-window search takes up to a few minutes) and records every proxied request for documentation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const [url, name, prefix, tooltipSource = 'finnreise', maxWaitArg = '240000'] = process.argv.slice(2);
assert.ok(url && /^[a-z0-9-]+$/.test(name ?? '') && /^[a-z0-9-]+$/.test(prefix ?? ''), 'URL, video name and prefix required');
const maxWait = Number(maxWaitArg);
const assets = resolve(ROOT, 'videos', name, 'assets');
await mkdir(assets, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DPR = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userscript = (await readFile(resolve(ROOT, '../../site/cashback-varsler.user.js'), 'utf8'))
  .replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');

const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--disable-blink-features=AutomationControlled'] });
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: DPR,
    isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', userAgent: UA });
  const requests = [];
  await context.exposeBinding('__gmFetch', async (_source, d) => {
    const headers = { 'User-Agent': UA, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5', ...(d.headers || {}) };
    try {
      const response = await context.request.fetch(d.url, { method: d.method || 'GET', headers, data: d.data,
        timeout: d.timeout || 60000, failOnStatusCode: false, maxRedirects: 10 });
      const responseText = await response.text();
      requests.push({ method: d.method || 'GET', url: d.url.slice(0, 300), status: response.status() });
      return { status: response.status(), statusText: response.statusText(), responseText, finalUrl: response.url() };
    } catch (error) {
      requests.push({ method: d.method || 'GET', url: d.url.slice(0, 300), error: String(error).slice(0, 200) });
      return { status: 0, timedOut: /timeout/i.test(String(error)), error: String(error) };
    }
  });
  await context.addInitScript(() => {
    const store = { 'cashback-varsler-chips-collapsed': true, 'cashback-varsler-codes-collapsed': true };
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_xmlhttpRequest = (d) => {
      let aborted = false;
      window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data, timeout: d.timeout }).then((r) => {
        if (aborted) return;
        if (r.status === 0) {
          const fail = { ...r, readyState: 4, status: 0, responseText: '', response: null };
          (r.timedOut ? (d.ontimeout ?? d.onerror) : d.onerror)?.(fail);
          d.onloadend?.(fail);
          return;
        }
        let response = r.responseText;
        if (d.responseType === 'json') { try { response = JSON.parse(r.responseText); } catch { response = null; } }
        const resp = { ...r, readyState: 4, response, responseXML: null, context: d.context };
        d.onreadystatechange?.(resp);
        d.onload?.(resp);
        d.onloadend?.(resp);
      });
      return { abort() { aborted = true; d.onabort?.(); } };
    };
  });

  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response && response.status() < 400, `Page must load (status ${response?.status()})`);
  await sleep(4000);
  const dismissals = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let clicked = false;
    for (const frame of page.frames()) {
      for (const label of [/^(avvis alle|avslå alle|kun nødvendige|bare nødvendige|tilpass eller avvis|reject all|reject|decline)/i, /^(nei,?\s*takk!?|lukk)$/i]) {
        const button = frame.getByRole('button', { name: label }).first();
        if (await button.isVisible().catch(() => false)) {
          dismissals.push(await button.innerText().catch(() => String(label)));
          await button.click().catch(() => {});
          await sleep(900);
          clicked = true;
          break;
        }
      }
      if (clicked) break;
    }
    if (!clicked) break;
  }
  // FINN viser cookiedialogen med «Godta alle» og «Tilpass eller avvis»; avvis gjennom tilpasningen.
  for (const frame of page.frames()) {
    const reject = frame.getByRole('button', { name: /^(avvis alle|lagre og lukk|lagre innstillinger)/i }).first();
    if (await reject.isVisible().catch(() => false)) { dismissals.push(await reject.innerText()); await reject.click().catch(() => {}); await sleep(900); }
  }
  // SCROLLY=<css px> scrolls the page before the screenshots, e.g. past FINN's tab bar whose
  // «Billigst» price ignores the stop filter. The panel is fixed and not affected.
  if (process.env.SCROLLY) { await page.evaluate((y) => window.scrollBy(0, y), Number(process.env.SCROLLY)); await sleep(800); }
  await page.screenshot({ path: resolve(assets, `${prefix}-before.png`) });

  await page.addScriptTag({ content: userscript });
  const cards = page.locator('#cashback-varsler-notice .price-match-card');
  await cards.first().waitFor({ state: 'visible', timeout: 90000 });
  const startedAt = Date.now();
  let stableSince = Date.now();
  let lastText = '';
  while (Date.now() - startedAt < maxWait) {
    await sleep(3000);
    const state = await page.evaluate(() => {
      const root = document.getElementById('cashback-varsler-notice')?.shadowRoot;
      const all = [...(root?.querySelectorAll('.price-match-card') ?? [])];
      return { text: all.map((c) => c.innerText).join('|'), updating: all.some((c) => c.classList.contains('price-match-card--updating')) };
    });
    if (state.text !== lastText) { lastText = state.text; stableSince = Date.now(); }
    if (!state.updating && Date.now() - stableSince > 9000) break;
  }
  await page.mouse.move(2, 840);
  await page.screenshot({ path: resolve(assets, `${prefix}-after.png`) });

  const metadata = await page.evaluate((dpr) => {
    const root = document.getElementById('cashback-varsler-notice').shadowRoot;
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((x) => Math.round(x * dpr)); };
    const text = (el) => el?.innerText?.trim() ?? '';
    return {
      title: document.title,
      panel: box(root.querySelector('.panel')),
      chips: { text: text(root.querySelector('.flight-filter-chips')), box: box(root.querySelector('.flight-filter-chips')) },
      cards: [...root.querySelectorAll('.price-match-card')].map((card) => {
        const row = card.closest('.cbn-tooltip-row') ?? card.parentElement;
        return {
          source: [...card.querySelector('.provider-badge')?.classList ?? []].find((c) => c.startsWith('provider-') && c !== 'provider-badge')?.slice(9),
          text: text(card), box: box(card), href: card.href,
          price: text(card.querySelector('.price-match-price')),
          info: box(row.querySelector('.cbn-tooltip-trigger')),
          updating: card.classList.contains('price-match-card--updating'),
        };
      }),
      tooltips: [...root.querySelectorAll('.offer-tooltip')].map((el) => el.textContent.trim()).filter((t) => t.length > 0),
    };
  }, DPR);

  const hidingStyle = await page.addStyleTag({ content: 'html,body { background:transparent!important } body * { visibility:hidden!important } #cashback-varsler-notice { visibility:visible!important }' });
  await page.screenshot({ path: resolve(assets, `${prefix}-panel.png`), omitBackground: true });
  await hidingStyle.evaluate((element) => element.remove());

  const target = metadata.cards.findIndex((card) => card.source === tooltipSource);
  if (target >= 0 && metadata.cards[target].info) {
    const info = metadata.cards[target].info;
    await page.touchscreen.tap((info[0] + info[2]) / 2 / DPR, (info[1] + info[3]) / 2 / DPR);
    const tooltip = page.locator('#cashback-varsler-notice .cbn-tooltip-open');
    await tooltip.waitFor({ state: 'visible', timeout: 10000 });
    await sleep(500);
    const tipBox = await tooltip.boundingBox();
    assert.ok(tipBox.x >= 0 && tipBox.x + tipBox.width <= 393, 'Tooltip stays in viewport');
    await page.screenshot({ path: resolve(assets, `${prefix}-tip.png`) });
    metadata.tip = { source: tooltipSource, text: await tooltip.innerText(),
      box: [tipBox.x, tipBox.y, tipBox.x + tipBox.width, tipBox.y + tipBox.height].map((x) => Math.round(x * DPR)) };
  }

  const capturePath = resolve(assets, 'capture.json');
  const existing = existsSync(capturePath) ? JSON.parse(await readFile(capturePath, 'utf8')) : {};
  existing[prefix] = { url, finalUrl: page.url(), capturedAt: new Date().toISOString(), screenshotPx: [1179, 2556],
    dismissals, ...metadata, requests };
  await writeFile(capturePath, JSON.stringify(existing, null, 2) + '\n');
  const forScene = Object.fromEntries(Object.entries(existing).map(([key, value]) => [key,
    { panel: value.panel, chips: value.chips, cards: value.cards, tip: value.tip }]));
  await writeFile(resolve(assets, 'capture.js'), `window.CAPTURES = ${JSON.stringify(forScene)};\n`);
  console.log(JSON.stringify({ name, prefix, finalUrl: page.url(), dismissals, chips: metadata.chips.text,
    cards: metadata.cards.map((card) => `${card.source}: ${card.text.replace(/\s+/g, ' ')}${card.updating ? ' (oppdaterer)' : ''}`),
    tip: metadata.tip?.text?.slice(0, 600), failedRequests: requests.filter((r) => r.error || r.status >= 400).length }, null, 2));
} finally {
  await browser.close();
}
