// Flight variant of overlay.mjs (mobile 393x852 @3x -> 1179x2556).
//
//   CH=chrome LOGGM=1 node overlay-flights.mjs '<url>' shots/flights/<name>.png [maxWaitMs=60000]
//
// Env:
//   SELECT=1      sas.no: pick the cheapest Economy outbound + inbound (Light) so the page shows a round-trip total
//   LOGGM=1       log every proxied GM_xmlhttpRequest (status, bytes, url)
//   GMDUMP=dir    also save every GM response body to <dir>/NNN.txt (debugging)
//   HEADED=1      run a visible browser
//
// Differences from overlay.mjs (the GM shim is what matters, reuse it for hotels):
//   * GM_xmlhttpRequest goes through Playwright's ctx.request (APIRequestContext) instead of bare Node fetch.
//     That gives it a cookie jar shared with the browser context, like a real userscript manager. momondo
//     needs this: its poll endpoint answers 401 INVALID_SESSION without the cookies set by the HTML page.
//   * Browser-like default headers (User-Agent = the context UA, Accept-Language nb-NO). momondo serves HTML
//     without `window.R9.formToken` to Node's default UA ("node"), so the momondo source silently died.
//   * Honours `timeout` -> ontimeout, responseType 'json', onreadystatechange/onloadend, abort().
//   * Waits until the price-match cards stop "updating" instead of a fixed sleep, then measures boxes.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [,, url, out, maxWait = '60000'] = process.argv;
const env = process.env;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8')
  .replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DPR = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: env.CH || undefined, headless: !env.HEADED, args: ['--disable-gpu', '--use-angle=swiftshader', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', userAgent: UA });

// ---- GM shim -------------------------------------------------------------------------------------------
let gmCount = 0;
if (env.GMDUMP) mkdirSync(env.GMDUMP, { recursive: true });
await ctx.exposeBinding('__gmFetch', async (_src, d) => {
  const n = ++gmCount;
  const headers = { 'User-Agent': UA, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en-US;q=0.6,en;q=0.5', ...(d.headers || {}) };
  const t0 = Date.now();
  try {
    const r = await ctx.request.fetch(d.url, {
      method: d.method || 'GET', headers, data: d.data,
      timeout: d.timeout || 60000, failOnStatusCode: false, ignoreHTTPSErrors: true, maxRedirects: 10,
    });
    const text = await r.text();
    if (env.LOGGM) console.log('[gm]', n, r.status(), (d.method || 'GET').padEnd(4), `${text.length}b`, `${Date.now() - t0}ms`, d.url.slice(0, 150));
    if (env.GMDUMP) writeFileSync(`${env.GMDUMP}/${String(n).padStart(3, '0')}.txt`, `${d.method || 'GET'} ${d.url}\n${d.data ?? ''}\n----- ${r.status()}\n${text}`);
    return { status: r.status(), statusText: r.statusText(), responseText: text, finalUrl: r.url(), responseHeaders: r.headersArray().map((h) => `${h.name}: ${h.value}`).join('\r\n') };
  } catch (e) {
    const timedOut = /timeout/i.test(String(e));
    if (env.LOGGM) console.log('[gm]', n, timedOut ? 'TIMEOUT' : 'ERROR', d.url.slice(0, 150), String(e).slice(0, 120));
    return { status: 0, timedOut, error: String(e) };
  }
});
await ctx.addInitScript(() => {
  const store = {};
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
  window.GM = {
    getValue: async (k, d) => window.GM_getValue(k, d),
    setValue: async (k, v) => window.GM_setValue(k, v),
    xmlHttpRequest: (d) => new Promise((res, rej) => window.GM_xmlhttpRequest({ ...d, onload: (r) => { d.onload?.(r); res(r); }, onerror: (e) => { d.onerror?.(e); rej(e); }, ontimeout: (e) => { d.ontimeout?.(e); rej(e); } })),
  };
});

const page = await ctx.newPage();
page.on('console', (m) => { if (/cashback|norge/i.test(m.text()) || (m.type() === 'error' && env.LOGERR)) console.log('[console]', m.type(), m.text().slice(0, 300)); });
if (env.LOGNET) page.on('response', async (r) => { if (new RegExp(env.LOGNET).test(r.url())) console.log('[net]', r.status(), r.request().method(), r.url().slice(0, 140), r.status() >= 400 ? (await r.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ') : ''); });
page.on('pageerror', (e) => { if (/cashback|varsler/i.test(String(e.stack))) console.log('[pageerror]', String(e).slice(0, 300)); });

const box = (r) => [Math.round(r.x * DPR), Math.round(r.y * DPR), Math.round((r.x + r.width) * DPR), Math.round((r.y + r.height) * DPR)];
const result = { url, before: {}, after: {} };

// ---- page prep ------------------------------------------------------------------------------------------
const host = new URL(url).hostname.replace(/^www\./, '');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

async function clickConsent(names, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const frame of page.frames()) {
      for (const name of names) {
        const b = frame.getByRole('button', { name, exact: false }).first();
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await sleep(1000); return name; }
      }
    }
    await sleep(500);
  }
  return undefined;
}

async function sasCheapestRow(bound) {
  return page.evaluate((bound) => {
    const rows = [...document.querySelectorAll(`[data-testid^=upsell-flight-row-${bound}]`)];
    const prices = rows.map((r) => { const b = r.querySelector('[data-testid=upsell-lowestFare-button-0]'); return b ? (+b.innerText.replace(/[^\d]/g, '') || 1e9) : 1e9; });
    return prices.indexOf(Math.min(...prices));
  }, bound);
}

if (host === 'sas.no') {
  console.log('consent:', await clickConsent(['Tillat alle'], 30000));
  await page.locator('[data-testid=upsell-lowestFare-button-0]').first().waitFor({ timeout: 90000 })
    .catch(async (e) => { await page.screenshot({ path: out.replace('.png', '-fail.png') }); throw e; });
  await sleep(1500);
  if (env.SELECT) {
    // Cheapest Economy row per direction, then its cheapest fare card (Light), so the sticky cart shows a
    // round-trip total that is comparable with the overlay's round-trip totals.
    for (const bound of ['outbound', 'inbound']) {
      const rows = page.locator(`[data-testid^=upsell-flight-row-${bound}]`);
      await rows.first().waitFor({ timeout: 60000 });
      await sleep(1500);
      const i = await sasCheapestRow(bound);
      const rowText = (await rows.nth(i).innerText()).replace(/\s+/g, ' ');
      await rows.nth(i).locator('[data-testid=upsell-lowestFare-button-0]').click();
      const firstCard = page.locator(`[data-testid^=upsell-product-card-economy]`).first();
      await firstCard.waitFor({ timeout: 20000 });
      await sleep(1200);
      // carousel: page left until the first (cheapest) economy card is on screen
      for (let k = 0; k < 4 && ((await firstCard.boundingBox())?.x ?? 0) < 0; k++) {
        await page.getByRole('button', { name: 'Forrige produkt' }).first().click().catch(() => {});
        await sleep(600);
      }
      const radio = firstCard.locator('input[type=radio]').first();
      const label = await radio.getAttribute('aria-label');
      const id = await radio.getAttribute('id');
      await page.locator(`label[for="${id}"]`).last().click().catch(async () => { await radio.check({ force: true }); });
      await sleep(2000);
      const total = await page.locator('[data-testid=cart-total-price]').first().innerText().catch(() => '?');
      console.log(`SAS ${bound}: row ${i} [${rowText.slice(0, 90)}] fare "${label}" -> cart ${total}`);
      result.sas = { ...(result.sas ?? {}), [bound]: { row: rowText, fare: label }, cartTotal: total };
      if (bound === 'outbound') {
        await page.locator('[data-testid=cart-action-button]').first().click();
        await sleep(3000);
      }
    }
    console.log('URL after select:', page.url());
  }
} else if (host === 'finn.no') {
  console.log('consent:', await clickConsent(['Godta alle', 'Godta'], 20000));
  await sleep(+(env.PREWAIT || 15000));
} else {
  console.log('consent:', await clickConsent(['Godta alle', 'Aksepter alle', 'Tillat alle', 'Accept all', 'Jeg godtar', 'OK'], 10000));
  await sleep(+(env.PREWAIT || 8000));
}
if (env.SCROLLTO) { await page.locator(env.SCROLLTO).first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(800); }

await page.screenshot({ path: out.replace('.png', '-before.png') });

// The page's own price(s): every visible leaf-ish element whose text is a price.
const pagePrices = async () => page.evaluate(() => {
  const res = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('#cashback-varsler-notice')) continue;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (t.length > 40 || !/(\d[\d\s.]*,-|\d[\d\s]* ?(kr|NOK))/.test(t)) continue;
    if ([...el.children].some((c) => (c.innerText || '').replace(/\s+/g, ' ').trim() === t)) continue; // keep innermost
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
    res.push({ text: t, testid: el.closest('[data-testid]')?.getAttribute('data-testid') ?? null, rect: [r.x, r.y, r.width, r.height] });
  }
  return res;
});
result.before.pagePrices = (await pagePrices()).map((p) => ({ ...p, box: box({ x: p.rect[0], y: p.rect[1], width: p.rect[2], height: p.rect[3] }) }));
console.log('PAGE PRICES', JSON.stringify(result.before.pagePrices.map((p) => [p.text, p.testid, p.box])));

// ---- inject + wait --------------------------------------------------------------------------------------
await page.addScriptTag({ content: us });
const t0 = Date.now();
let lastSig = '';
let stableSince = Date.now();
while (Date.now() - t0 < +maxWait) {
  await sleep(2000);
  const state = await page.evaluate(() => {
    const root = document.getElementById('cashback-varsler-notice')?.shadowRoot;
    if (!root) return undefined;
    const cards = [...root.querySelectorAll('.price-match-card')];
    return { cards: cards.map((c) => c.innerText.replace(/\s+/g, ' ').trim()), updating: cards.filter((c) => c.classList.contains('price-match-card--updating')).length };
  });
  const sig = JSON.stringify(state ?? null);
  if (sig !== lastSig) { lastSig = sig; stableSince = Date.now(); console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, sig.slice(0, 400)); }
  const live = state?.cards.filter((c) => /\d kr/.test(c)).length ?? 0;
  if (state && state.updating === 0 && live >= 3 && Date.now() - stableSince > 6000) break;
}
await sleep(1000);
await page.screenshot({ path: out });

// ---- measure --------------------------------------------------------------------------------------------
result.after.pagePrices = (await pagePrices()).map((p) => ({ text: p.text, testid: p.testid, box: box({ x: p.rect[0], y: p.rect[1], width: p.rect[2], height: p.rect[3] }) }));
const panel = await page.evaluate(() => {
  const root = document.getElementById('cashback-varsler-notice')?.shadowRoot;
  if (!root) return undefined;
  const r = (el) => { if (!el) return undefined; const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
  const t = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const q = (s) => root.querySelector(s);
  return {
    panel: r(q('.panel') ?? q('section')),
    header: r(q('.header')), title: t(q('.title')), titleRect: r(q('.title')),
    offerRows: [...root.querySelectorAll('.offer-list > *')].map((e) => ({ text: t(e), rect: r(e) })),
    priceMatchToggle: r(q('.price-match-toggle')),
    priceMatches: [...root.querySelectorAll('.price-match-card')].map((c) => ({
      text: t(c), href: c.href, rect: r(c),
      route: t(c.querySelector('.price-match-product')), shop: t(c.querySelector('.price-match-shop')),
      duration: t(c.querySelector('.price-match-duration')), price: t(c.querySelector('.price-match-price')), priceRect: r(c.querySelector('.price-match-price')),
      badge: t(c.querySelector('.provider-badge')), badgeRect: r(c.querySelector('.provider-badge')),
    })),
    cashbackToggle: r(q('.bonus-chips-toggle')),
    cashbackGroups: [...root.querySelectorAll('.chip-group')].map((g) => ({ label: t(g.querySelector('.chip-group-label')), rect: r(g) })),
    cashbackRows: [...root.querySelectorAll('.bonus-chip')].map((e) => ({ text: t(e), rect: r(e) })),
    codesToggle: r(q('.codes-toggle')),
    tooltips: [...root.querySelectorAll('.offer-tooltip')].map((e) => e.textContent.trim().slice(0, 600)).filter(Boolean),
  };
});
const toBox = (v) => (Array.isArray(v) ? box({ x: v[0], y: v[1], width: v[2], height: v[3] }) : v);
const conv = (o) => (Array.isArray(o) && typeof o[0] === 'number' ? toBox(o) : Array.isArray(o) ? o.map(conv) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, conv(v)])) : o);
result.after.panel = conv(panel);
console.log('PANEL', JSON.stringify(result.after.panel, null, 1));
writeFileSync(out.replace('.png', '.boxes.json'), JSON.stringify(result, null, 2));

if (panel) {
  await page.addStyleTag({ content: 'html, body { background: transparent !important; } * { visibility: hidden !important; } #cashback-varsler-notice { visibility: visible !important; }' });
  await sleep(300);
  await page.screenshot({ path: out.replace('.png', '-panel.png'), omitBackground: true });
}
await browser.close();
