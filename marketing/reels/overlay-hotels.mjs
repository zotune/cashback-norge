// Hotell-variant av overlay.mjs (mobil 393x852 @3x). Forskjeller:
// - GM_xmlhttpRequest-shim som oppfører seg som en ekte userscript-manager:
//   nettleserens UA/Accept-Language, cookies fra (og tilbake til) browser-konteksten,
//   timeout -> ontimeout, finalUrl, responseHeaders, onreadystatechange/onloadend.
//   GMMODE=ctx (standard): Playwright context.request (deler cookie-jar med siden).
//   GMMODE=page: fetch() fra en skjult hjelpefane på mål-originen (ekte Chrome-TLS + anti-bot-cookies).
//   GMMODE=node: ren Node fetch (gammel oppførsel, for sammenligning).
// - DBG=1 instrumenterer renderCurrentContext i minnet (ingen filer endres).
// - Lukker cookie-/påloggingsbannere på Booking m.fl. også etter injisering.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const [,, url, out, wait = '40000'] = process.argv;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MODE = process.env.GMMODE || 'ctx';
const LOG = !!process.env.LOGGM;
let us = readFileSync(new URL(process.env.US || '../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
// FIXBOOKINGCITY=1: KUN for feilsøking — Booking-LD+JSON har gateadresse i addressLocality
// («Landgangen 1»), så by hentes fra streetAddress («…, 0252 Oslo, Norge») i stedet.
if (process.env.FIXBOOKINGCITY) {
  const a = '    const destinationName = readStringValue(address?.addressLocality)?.split(",")[0]?.trim();';
  if (!us.includes(a)) throw new Error('FIXBOOKINGCITY fant ikke linja');
  // By = siste del av streetAddress etter at land- og postnummer-delene er fjernet:
  // «Landgangen 1, Frogner bydel, 0252 Oslo, Norge» -> Oslo; «21 Piccadilly, City of Westminster, London, W1J 0BH, Storbritannia» -> London.
  us = us.replace(a, `    const __country = readStringValue(address?.addressCountry);
    const __postal = readStringValue(address?.postalCode);
    const __parts = (readStringValue(address?.streetAddress) ?? "").split(",").map((p) => p.trim()).filter((p) => p.length > 0 && p !== __country && p !== __postal);
    const __last = __parts.length >= 2 ? __parts[__parts.length - 1].replace(__postal ?? "\\u0000", "").trim() : undefined;
    const destinationName = __last !== undefined && __last.length > 0 && !/\\d/.test(__last) ? __last : undefined;
    console.log('[cbdbg] booking city', destinationName);`);
}
if (process.env.DBG) {
  const a = '  async function renderCurrentContext() {\n    const generation = ++renderGeneration;';
  const b = '      getRegionPricesForCurrentPage().catch(() => void 0)\n    ]);\n';
  if (!us.includes(a) || !us.includes(b)) throw new Error('DBG-hook fant ikke renderCurrentContext');
  us = us.replace(a, `  window.__cb = { extractHotelSearchMeta, buildHotelPriceMatchSession, getCurrentOffers, buildHotelSearchMetaKey, getPriceMatchesForCurrentPage };
  async function renderCurrentContext() {
    const generation = ++renderGeneration; const __t0 = Date.now(); console.log('[cbdbg] render start gen=' + generation);`)
    .replace(b, `${b}    console.log('[cbdbg] render done gen=' + generation + ' latest=' + renderGeneration + ' offers=' + offers.length + ' pm=' + priceMatches.length + ' ms=' + (Date.now() - __t0) + ' ' + JSON.stringify(priceMatches.map((m) => [m.sourceName, m.price, m.shopName, m.amount])));\n`)
    .replace('  function renderNotice(offers, ', "  function renderNotice(...__a) { console.log('[cbdbg] renderNotice'); try { return __renderNotice(...__a); } catch (e) { console.log('[cbdbg] renderNotice threw ' + (e && e.stack || e)); } }\n  function __renderNotice(offers, ")
    .replace('  function clearNotice() {\n', "  function clearNotice() {\n    if (document.getElementById(HOST_ID)) console.log('[cbdbg] clearNotice ' + new Error().stack.split('\\n').slice(2, 4).join(' / '));\n");
  if (!us.includes('__renderNotice') || !us.includes('[cbdbg] clearNotice')) throw new Error('DBG-hook renderNotice/clearNotice');
}

const browser = await chromium.launch({ channel: process.env.CH || undefined, headless: !process.env.HEADED, args: ['--disable-gpu', '--use-angle=swiftshader', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', userAgent: UA,
  extraHTTPHeaders: { 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en-US;q=0.6,en;q=0.5' } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

// ---- GM-transport ----------------------------------------------------------
const helperPages = new Map();
async function helperFor(origin) {
  if (!helperPages.has(origin)) {
    helperPages.set(origin, (async () => {
      const p = await ctx.newPage();
      await p.goto(origin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      return p;
    })());
  }
  return helperPages.get(origin);
}
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
async function gmFetch(d) {
  const started = Date.now();
  const timeout = d.timeout || 30000;
  const method = (d.method || 'GET').toUpperCase();
  const headers = { ...(d.headers || {}) };
  let res;
  try {
    if (MODE === 'page') {
      const origin = new URL(d.url).origin;
      const p = await helperFor(origin);
      res = await p.evaluate(async ({ url, method, headers, data, timeout }) => {
        const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), timeout);
        try {
          const r = await fetch(url, { method, headers, body: data, credentials: 'include', signal: ac.signal });
          const text = await r.text();
          return { status: r.status, statusText: r.statusText, responseText: text, finalUrl: r.url, responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n') };
        } catch (e) { return { status: 0, error: String(e), timedOut: ac.signal.aborted }; } finally { clearTimeout(tid); }
      }, { url: d.url, method, headers, data: d.data, timeout });
    } else if (MODE === 'node') {
      const r = await fetch(d.url, { method, headers, body: d.data, signal: AbortSignal.timeout(timeout) });
      res = { status: r.status, statusText: r.statusText, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n') };
    } else {
      // context.request: deler cookie-jar med browser-konteksten (Set-Cookie lagres, cookies sendes),
      // bruker kontekstens userAgent + extraHTTPHeaders — som Tampermonkey/Userscripts-appen.
      const r = await ctx.request.fetch(d.url, { method, headers, data: d.data, timeout, failOnStatusCode: false, maxRedirects: 10 });
      res = { status: r.status(), statusText: r.statusText(), responseText: await r.text(), finalUrl: r.url(), responseHeaders: r.headersArray().map(({ name, value }) => `${name}: ${value}`).join('\r\n') };
    }
  } catch (e) {
    const timedOut = /timeout|abort/i.test(String(e));
    res = { status: 0, error: String(e).slice(0, 200), timedOut };
  }
  if (LOG) {
    const ct = (res.responseHeaders || '').match(/content-type: ([^\r\n;]+)/i)?.[1] || '';
    console.log(`[gm ${ts()}] ${res.status}${res.timedOut ? ' TIMEOUT' : ''} ${method} ${d.url.slice(0, 150)} (${Date.now() - started} ms, ${ct}, ${res.responseText?.length ?? 0} b)${res.error ? ' ' + res.error : ''}`);
    if (process.env.LOGBODY && res.responseText) console.log('      ' + res.responseText.slice(0, +process.env.LOGBODY || 300).replace(/\s+/g, ' '));
  }
  if (process.env.DUMP && res.responseText) { const f = `${process.env.DUMP}/${Date.now()}-${new URL(d.url).hostname}.txt`; writeFileSync(f, `${method} ${d.url}\n${d.data || ''}\n\n${res.status}\n${res.responseHeaders}\n\n${res.responseText}`); }
  return res;
}
await ctx.exposeBinding('__gmFetch', (_src, d) => gmFetch(d));
await ctx.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => {
    let aborted = false;
    window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data, timeout: d.timeout }).then((r) => {
      if (aborted) return;
      if (r.status === 0) {
        const e = { ...r, readyState: 4, status: 0, finalUrl: d.url, responseText: '', response: null };
        if (r.timedOut && d.ontimeout) d.ontimeout(e); else d.onerror?.(e);
        d.onloadend?.(e);
        return;
      }
      let response = r.responseText;
      if (d.responseType === 'json') { try { response = JSON.parse(r.responseText); } catch { response = null; } }
      const resp = { readyState: 4, status: r.status, statusText: r.statusText, responseText: r.responseText, response, finalUrl: r.finalUrl, responseHeaders: r.responseHeaders };
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

// ---- Side -----------------------------------------------------------------
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (process.env.ALLCONSOLE || /cashback|cbdbg|\[gm/i.test(t) || (m.type() === 'error' && /cashback|userscript/i.test(t))) console.log(`[console ${ts()} ${m.type()}]`, t.slice(0, 400)); });
page.on('pageerror', (e) => { if (/cashback|cb|notice/i.test(String(e.stack))) console.log('[pageerror]', String(e).slice(0, 300)); });

async function dismiss(afterInject = false) {
  const sels = ['#onetrust-accept-btn-handler', '#onetrust-reject-all-handler', 'button[aria-label="Lukk påloggingsinfo."]', 'button[aria-label="Dismiss sign-in info."]', '[role="dialog"] button[aria-label*="Lukk"]', '[role="dialog"] button[aria-label*="Close"]', '[data-testid="cookie-popup-accept"]'];
  for (const s of sels) {
    const b = page.locator(s).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
  }
  // Etter injisering: kun CSS-selektorene over (tekstknapper kunne truffet knapper i overlayets shadow DOM).
  if (afterInject) return;
  for (const t of ['Godta alt', 'Godta alle', 'Aksepter alle', 'Tillat alle', 'Godta', 'Jeg godtar', 'Accept all', 'Accept', 'Avvis', 'OK', 'Lukk', 'LUKK']) {
    const b = page.getByRole('button', { name: t, exact: true }).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
  }
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+(process.env.PREWAIT || 6000));
await dismiss();
await page.waitForTimeout(1500);
await dismiss();
// SCROLLTO='<css>' [SCROLLOFF=px]: scroll så første synlige treff havner SCROLLOFF CSS-px fra toppen.
// SCROLLTEXT='<regex>': som SCROLLTO, men minste synlige element hvis tekst matcher regex.
async function scrollToSel() {
  if (process.env.SCROLLTEXT) {
    await page.evaluate(({ re, off }) => { const rx = new RegExp(re); const el = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && rx.test((e.innerText || '').trim())).sort((a, b) => a.innerText.length - b.innerText.length)[0]; if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }, { re: process.env.SCROLLTEXT, off: +(process.env.SCROLLOFF || 120) });
    await page.waitForTimeout(1200);
    return;
  }
  if (!process.env.SCROLLTO) return;
  await page.evaluate(({ sel, off }) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }, { sel: process.env.SCROLLTO, off: +(process.env.SCROLLOFF || 120) });
  await page.waitForTimeout(1200);
}
await scrollToSel();
if (process.env.SCROLLY) { await page.evaluate((y) => window.scrollTo(0, +y), process.env.SCROLLY); await page.waitForTimeout(800); }
await page.screenshot({ path: out.replace('.png', '-before.png') });
console.log('TITLE', await page.title());
console.log('OWNPRICES', JSON.stringify(await page.evaluate(() => {
  // Booking: rompriser («NOK 4 135»), uten gjennomstreket førpris og «Pris fra» i karuseller for andre hoteller.
  const els = [...document.querySelectorAll('div, span')].filter((e) => e.children.length === 0 && /^(NOK|kr)\s?[\d\s]{3,}$|^[\d\s]{3,}\s?kr$/.test((e.innerText || '').trim()) && !/strikethrough|destructive/.test(e.className) && !e.closest('[class*=carousel], s, del') && e.getClientRects().length);
  const nums = els.map((e) => +e.innerText.replace(/\D/g, '')).filter((n) => n > 100);
  return { min: Math.min(...nums), all: [...new Set(nums)].sort((a, b) => a - b).slice(0, 12) };
})));
if (process.env.DBG) {
  page.on('pageerror', (e) => console.log('[pageerror-after]', String(e.stack || e).slice(0, 400)));
  await page.evaluate(() => new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.id === 'cashback-varsler-notice') console.log('[cbdbg] host removed by page from ' + (m.target.tagName || m.target.nodeName)); }).observe(document.documentElement, { childList: true, subtree: true }));
}
await page.addScriptTag({ content: us });
const deadline = Date.now() + +wait;
let seenAt;
while (Date.now() < deadline) {
  await page.waitForTimeout(1000);
  const has = await page.evaluate(() => !!document.getElementById('cashback-varsler-notice'));
  if (has && seenAt === undefined) { seenAt = Date.now(); console.log(`[notice ${ts()}] rendered`); }
  if (process.env.EARLY && seenAt !== undefined && Date.now() - seenAt > +process.env.EARLY) break;
}
await dismiss(true);
await page.waitForTimeout(500);
await page.screenshot({ path: out });
const hostEl = await page.evaluate(() => !!document.getElementById('cashback-varsler-notice'));
console.log('HOST', hostEl);
if (hostEl) {
  console.log('NOTICE', (await page.evaluate(() => document.getElementById('cashback-varsler-notice').shadowRoot.textContent)).replace(/\s+/g, ' ').slice(0, 1500));
  // Bokser i skjermbilde-px (CSS-px × deviceScaleFactor 3), målt fra DOM.
  const boxes = await page.evaluate((ownRe) => {
    const r3 = (e, label) => { const b = e.getBoundingClientRect(); return { label, text: (e.innerText || e.value || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80), x: Math.round(b.x * 3), y: Math.round(b.y * 3), w: Math.round(b.width * 3), h: Math.round(b.height * 3) }; };
    const out = [];
    if (ownRe) {
      const rx = new RegExp(ownRe);
      const own = [...document.querySelectorAll('body *')].filter((e) => !e.closest('#cashback-varsler-notice') && e.getClientRects().length && rx.test((e.innerText || '').trim())).sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (own) out.push(r3(own, 'own-price'));
    }
    const sr = document.getElementById('cashback-varsler-notice').shadowRoot;
    const q = (sel, label) => sr.querySelectorAll(sel).forEach((e, i) => { if (e.getClientRects().length) out.push(r3(e, `${label}${sr.querySelectorAll(sel).length > 1 ? '#' + i : ''}`)); });
    q('.panel', 'panel'); q('.header', 'panel-header'); q('.title', 'panel-title'); q('.sum-input', 'sum-input');
    q('.price-match-toggle', 'price-match-toggle'); q('.price-match-card', 'match-row');
    q('.offer-link-wrapper', 'cashback-offer-row');
    q('.bonus-chips-toggle', 'extra-cashback-toggle'); q('.chip-group-label', 'chip-group-label'); q('.bonus-chip', 'cashback-row');
    q('.codes-toggle', 'codes-toggle'); q('.support', 'support-row'); q('.side-tab', 'side-tab');
    return out;
  }, process.env.OWNRE || '');
  for (const b of boxes) console.log('BOX', JSON.stringify(b));
  writeFileSync(out.replace('.png', '-boxes.json'), JSON.stringify({ url, screenshot: '1179x2556', scale: 3, boxes }, null, 1));
  await page.addStyleTag({ content: 'html, body { background: transparent !important; } * { visibility: hidden !important; } #cashback-varsler-notice { visibility: visible !important; }' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out.replace('.png', '-panel.png'), omitBackground: true });
}
if (process.env.HOLD) await page.waitForTimeout(+process.env.HOLD);
await browser.close();
