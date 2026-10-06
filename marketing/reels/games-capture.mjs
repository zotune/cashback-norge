// Game price-match captures (Steam / Epic). Copy of overlay.mjs + desktop.mjs ideas, kept separate so those stay untouched.
// Usage: MODE=desktop|mobile [SCROLL=buy|top] [HOVER=<card index>] [WAIT=25000] node games-capture.mjs '<url>' <name>
// Writes shots/games/<name>-{before,after,panel[,hover]}.png and shots/games/<name>.json with DOM boxes in screenshot px.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [,, url, name] = process.argv;
const MODE = process.env.MODE || 'desktop';
const WAIT = +(process.env.WAIT || 25000);
const mobile = MODE === 'mobile';
const dsf = mobile ? 3 : 2;
const outDir = new URL('./shots/games/', import.meta.url).pathname; mkdirSync(outDir, { recursive: true });
const out = (s) => `${outDir}${name}-${s}.png`;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADFUL ? false : true, args: ['--disable-gpu', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
const gmLog = [];
await ctx.exposeBinding('__gmFetch', async (_s, d) => {
  try {
    const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data });
    gmLog.push(`${r.status} ${d.method || 'GET'} ${d.url.slice(0, 120)}`);
    return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n') };
  } catch (e) { gmLog.push(`ERR ${d.url.slice(0, 120)} ${e}`); return { status: 0, error: String(e) }; }
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => {
    window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data }).then((r) => {
      if (r.status === 0) { d.onerror?.(r); return; }
      d.onload?.({ ...r, readyState: 4, response: d.responseType === 'json' ? (() => { try { return JSON.parse(r.responseText); } catch { return null; } })() : r.responseText });
    });
    return { abort() {} };
  };
  window.GM = { getValue: async (k, d) => window.GM_getValue(k, d), setValue: async (k, v) => window.GM_setValue(k, v), xmlHttpRequest: (d) => new Promise((res, rej) => window.GM_xmlhttpRequest({ ...d, onload: (r) => { d.onload?.(r); res(r); }, onerror: (e) => { d.onerror?.(e); rej(e); } })) };
});
// Steam: age gate + cookie consent answered up front (same values as overlay.mjs)
await ctx.addCookies(['birthtime=470703601', 'lastagecheckage=1-0-1985', 'wants_mature_content=1', 'cookieSettings=%7B%22version%22%3A1%2C%22preference_state%22%3A1%2C%22content_customization%22%3Anull%2C%22valve_analytics%22%3Anull%2C%22third_party_analytics%22%3Anull%2C%22third_party_content%22%3Anull%2C%22utm_enabled%22%3Atrue%7D']
  .map((c) => { const [n, ...v] = c.split('='); return { name: n, value: v.join('='), domain: 'store.steampowered.com', path: '/' }; }));
const page = await ctx.newPage();
const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('STATUS', resp?.status(), page.url());
await page.waitForTimeout(+(process.env.PREWAIT || 5000));
const isSteam = /store\.steampowered\.com/.test(page.url());
const isEpic = /store\.epicgames\.com/.test(page.url());
if (isEpic) {
  for (const t of [/godta alle/i, /accept all/i, /tillat alle/i, /^godta$/i, /^ok$/i]) {
    const b = page.getByRole('button', { name: t }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); console.log('CONSENT', String(t)); await page.waitForTimeout(1000); break; }
  }
  // Epic sometimes shows an age gate for mature titles
  if (await page.locator('#month_toggle').isVisible().catch(() => false)) {
    for (const [k, v] of [['month', '01'], ['day', '01'], ['year', '1985']]) {
      await page.click(`#${k}_toggle`).catch(() => {}); await page.waitForTimeout(400);
      await page.locator(`#${k}_menu li`).filter({ hasText: new RegExp(`^${v}$`) }).first().click().catch((e) => console.log('agegate', k, String(e).slice(0, 80)));
      await page.waitForTimeout(300);
    }
    await page.click('#btn_age_continue').catch(() => {});
    await page.waitForTimeout(3000);
    console.log('EPIC AGE GATE passed?', !(await page.locator('#month_toggle').isVisible().catch(() => false)));
  }
}
const scrolls = (process.env.SCROLL || 'top').split(',');
const sfx = (i, base) => (i === 0 ? base : `${base}-${scrolls[i]}`);
const doScroll = async (m) => {
  await page.evaluate((m) => {
    if (m === 'buy') {
      const el = document.querySelector('#game_area_purchase .game_area_purchase_game');
      if (el) { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (window.innerHeight * 0.30)); return; }
    }
    if (/^\d+$/.test(m)) { window.scrollTo(0, +m); return; }
    window.scrollTo(0, 0);
  }, m);
  await page.waitForTimeout(900);
};
const pageBoxes = async () => page.evaluate((s) => {
  const bx = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left * s), Math.round(r.top * s), Math.round(r.right * s), Math.round(r.bottom * s)]; };
  const res = { title: document.title, scrollY: Math.round(window.scrollY) };
  const h1 = document.querySelector('#appHubAppName, .apphub_AppName, h1'); res.h1 = [h1?.innerText?.trim(), bx(h1)];
  res.purchase = [...document.querySelectorAll('#game_area_purchase .game_area_purchase_game')].slice(0, 4).map((g) => {
    const t = g.querySelector('h1, h2');
    const final = g.querySelector('.discount_final_price, .game_purchase_price');
    const orig = g.querySelector('.discount_original_price');
    const pct = g.querySelector('.discount_pct');
    const block = g.querySelector('.discount_block, .game_purchase_price');
    return { title: t?.innerText?.trim(), price: final?.innerText?.trim(), orig: orig?.innerText?.trim(), pct: pct?.innerText?.trim(), box: bx(g), priceBox: bx(final), discountBlockBox: bx(block), origBox: bx(orig), pctBox: bx(pct), titleBox: bx(t) };
  });
  // generic: visible leaves with a price (Epic "NOK 579", "-50%")
  res.priceLeaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && (/^\s*(kr|NOK)?\s*\d[\d\s., ]*\s*(kr|NOK)?\s*$/i.test(e.textContent || '') && /kr|NOK/i.test(e.textContent || '') || /^-\d+%$/.test((e.textContent || '').trim())) && e.getBoundingClientRect().width > 0)
    .slice(0, 8).map((e) => [e.textContent.trim(), bx(e), getComputedStyle(e).textDecorationLine]);
  const buy = [...document.querySelectorAll('button')].find((b) => /^(Buy Now|Kjøp nå|Legg i handlevogn)$/i.test(b.innerText.trim()) && b.getBoundingClientRect().width > 0);
  res.buyButton = [buy?.innerText?.trim(), bx(buy)];
  return res;
}, dsf);
const beforeBoxes = [];
for (const [i, m] of scrolls.entries()) {
  await doScroll(m);
  await page.mouse.move(mobile ? 2 : 4, mobile ? 840 : 4);
  await page.screenshot({ path: out(sfx(i, 'before')) });
  beforeBoxes.push(await pageBoxes());
}
console.log('PAGE', JSON.stringify(beforeBoxes));
await doScroll(scrolls[0]);
await page.addScriptTag({ content: us });
await page.waitForTimeout(WAIT);
const afterBoxes = [];
for (const [i, m] of scrolls.entries()) {
  await doScroll(m);
  await page.mouse.move(mobile ? 2 : 4, mobile ? 840 : 4);
  await page.waitForTimeout(500);
  await page.screenshot({ path: out(sfx(i, 'after')) });
  afterBoxes.push(await pageBoxes());
}
await doScroll(scrolls[0]);
const host = await page.evaluate(() => !!document.getElementById('cashback-varsler-notice'));
console.log('HOST', host);
let panel = null;
if (host) {
  panel = await page.evaluate((s) => {
    const root = document.getElementById('cashback-varsler-notice').shadowRoot;
    const bx = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); if (r.width === 0) return null; return [Math.round(r.left * s), Math.round(r.top * s), Math.round(r.right * s), Math.round(r.bottom * s)]; };
    const txt = (e) => (e?.innerText || '').trim().replace(/\s*\n\s*/g, ' | ');
    const q = (sel) => [...root.querySelectorAll(sel)];
    return {
      section: bx(root.querySelector('section')),
      header: [txt(root.querySelector('.header')), bx(root.querySelector('.header'))],
      offerList: q('.offer-list > *').map((e) => [txt(e).slice(0, 80), bx(e)]),
      priceMatchToggle: bx(root.querySelector('.price-match-toggle')),
      priceMatchCards: q('.price-match-card').map((e) => ({ text: txt(e), box: bx(e), price: bx(e.querySelector('.price-match-price')), badge: [txt(e.querySelector('.provider-badge')), bx(e.querySelector('.provider-badge'))], shop: txt(e.querySelector('.price-match-shop')), href: e.href })),
      regionPrices: q('.region-price-card').map((e) => [txt(e), bx(e)]),
      chipsSection: bx(root.querySelector('.bonus-chips-section')),
      chips: q('.bonus-chip').map((e) => [txt(e), bx(e)]),
      codesSection: [txt(root.querySelector('.codes-section')).slice(0, 120), bx(root.querySelector('.codes-section'))],
      tooltips: q('.offer-tooltip').map((e) => (e.innerText || '').trim()),
    };
  }, dsf);
  console.log('PANEL', JSON.stringify(panel, null, 1));
  const pb = afterBoxes;
  console.log('PAGE_AFTER', JSON.stringify(pb));
  if (process.env.HOVER !== undefined) {
    const hv = process.env.HOVER;
    const idx = /^\d+$/.test(hv) ? +hv : Math.max(0, panel.priceMatchCards.findIndex((c) => new RegExp(hv, 'i').test(c.badge[0] + ' ' + c.shop)));
    console.log('HOVER idx', idx);
    const card = page.locator('#cashback-varsler-notice').locator('.price-match-card').nth(idx);
    await card.hover().catch((e) => console.log('hover fail', String(e)));
    await page.waitForTimeout(700);
    await page.screenshot({ path: out('hover') });
    const tip = await page.evaluate((s) => { const root = document.getElementById('cashback-varsler-notice').shadowRoot; const t = root.querySelector('.offer-tooltip.visible'); if (!t) return null; const r = t.getBoundingClientRect(); return [t.innerText.trim(), [Math.round(r.left * s), Math.round(r.top * s), Math.round(r.right * s), Math.round(r.bottom * s)]]; }, dsf);
    console.log('TOOLTIP', JSON.stringify(tip));
    if (panel) panel.hoverTooltip = tip;
    await page.mouse.move(mobile ? 2 : 4, mobile ? 840 : 4);
    await page.waitForTimeout(600);
  }
  writeFileSync(`${outDir}${name}.json`, JSON.stringify({ url, finalUrl: page.url(), capturedAt: new Date().toISOString(), mode: MODE, dsf, scrolls, screenshotPx: mobile ? [1179, 2556] : [2560, 1600], page: pb, panel }, null, 1));
  await page.addStyleTag({ content: 'html, body { background: transparent !important; } * { visibility: hidden !important; } #cashback-varsler-notice { visibility: visible !important; }' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('panel'), omitBackground: true });
}
if (process.env.LOGGM) console.log(gmLog.join('\n'));
await browser.close();
