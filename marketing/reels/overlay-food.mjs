// Kopi av overlay.mjs for matpris-reelen. Endringer:
// - Forespørsler til sesum.no går gjennom en ekte Chrome-fane på sesum.no (same-origin fetch).
//   Node fetch blir stoppet av Vercel Security Checkpoint (429), mens en vanlig nettleser slipper gjennom,
//   slik GM_xmlhttpRequest/utvidelsen i en ekte nettleser også gjør.
// - Flere tekster for cookie-knapper, og lukking av butikkvelger/innloggingsmodaler.
// - SCROLLPRICE=1 scroller siden slik at prisen på siden står øverst før skjermbildene.
// - Skriver JSON med bokser (skjermbildepiksler, 1179x2556) til <out>-boxes.json.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const [,, url, out, wait='9000'] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8');
const browser = await chromium.launch({channel: process.env.CH || undefined, args:['--disable-gpu','--use-angle=swiftshader','--disable-blink-features=AutomationControlled']});
const ctx = await browser.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true, bypassCSP:true, locale:'nb-NO', timezoneId:'Europe/Oslo',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
// Egen desktop-kontekst for proxy-faner (påvirker ikke butikkfanen).
const proxyCtx = await browser.newContext({ locale:'nb-NO' });
const BROWSER_FETCH_HOSTS = (process.env.BROWSER_FETCH_HOSTS || 'sesum.no').split(',');
const proxyPages = new Map();
async function browserFetch(d) {
  const u = new URL(d.url);
  const origin = u.origin;
  let pp = proxyPages.get(origin);
  if (!pp) {
    pp = (async () => { const p = await proxyCtx.newPage(); const r = await p.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); if (process.env.LOGGM) console.log('[proxy-page]', r?.status(), origin); await p.waitForTimeout(1500); return p; })();
    proxyPages.set(origin, pp);
  }
  const p = await pp;
  return p.evaluate(async ({ url, method, headers, data }) => {
    const r = await fetch(url, { method: method || 'GET', headers: headers || {}, body: data, credentials: 'include' });
    return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k,v])=>`${k}: ${v}`).join('\r\n') };
  }, d);
}
const gmLog = [];
await ctx.exposeBinding('__gmFetch', async (_src, d) => {
  try {
    const host = new URL(d.url).hostname.replace(/^www\./, '');
    let res;
    if (BROWSER_FETCH_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
      res = await browserFetch(d);
      if (process.env.LOGGM) console.log('[gm-browser]', res.status, d.method || 'GET', d.url.slice(0, 140));
    } else {
      const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data });
      if (process.env.LOGGM) console.log('[gm]', r.status, d.method || 'GET', d.url.slice(0, 140));
      res = { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k,v])=>`${k}: ${v}`).join('\r\n') };
    }
    gmLog.push([res.status, d.url]);
    return res;
  } catch (e) { if (process.env.LOGGM) console.log('[gm-err]', String(e).slice(0,120), d.url.slice(0,120)); return { status: 0, error: String(e) }; }
});
await ctx.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => {
    window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data }).then((r) => {
      if (r.status === 0) { d.onerror?.(r); return; }
      const resp = { ...r, readyState: 4, response: d.responseType === 'json' ? (()=>{try{return JSON.parse(r.responseText)}catch{return null}})() : r.responseText };
      d.onload?.(resp);
    });
    return { abort() {} };
  };
  window.GM = { getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v), xmlHttpRequest: (d)=>new Promise((res,rej)=>window.GM_xmlhttpRequest({...d,onload:(r)=>{d.onload?.(r);res(r)},onerror:(e)=>{d.onerror?.(e);rej(e)}})) };
});
const page = await ctx.newPage();
page.on('console', m => { if (/cashback|error/i.test(m.text()) && process.env.LOGCONSOLE) console.log('[console]', m.text().slice(0,200)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+(process.env.PREWAIT || 2500));
// cookie-banner
for (const t of ['Godta alle','Aksepter alle','Tillat alle','Godta','Jeg godtar','Aksepter','Accept all','OK']) {
  const b = page.getByRole('button', { name: t, exact: false }).first();
  if (await b.isVisible().catch(()=>false)) { await b.click().catch(()=>{}); console.log('cookie-click', t); break; }
}
await page.waitForTimeout(1200);
// lukk modaler (butikkvelger, innlogging, app-reklame)
for (const t of ['Lukk','LUKK','Ikke nå','Nei takk','Senere','Close']) {
  const b = page.getByRole('button', { name: t, exact: true }).first();
  if (await b.isVisible().catch(()=>false)) { await b.click().catch(()=>{}); console.log('modal-click', t); await page.waitForTimeout(600); }
}
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(800);
await page.mouse.move(1, 1).catch(()=>{});
// finn prisen på siden
const PRICE_JS = (sel) => {
  const re = /^(?:kr\s*)?\d{1,4}(?:\s?[,.]?\s?\d{2}|,-)?\s*(?:kr)?$/i;
  const pool = sel ? [...document.querySelectorAll(sel)] : [...document.querySelectorAll('body *')];
  const els = pool.filter((e) => {
    if (e.closest('#cashback-varsler-notice')) return false;
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
    if (!sel && (!t || t.length > 14 || !re.test(t) || !/\d/.test(t))) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return sel || !(e.parentElement && (e.parentElement.innerText || '').replace(/\s+/g, ' ').trim() === t);
  });
  return els.slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(e).fontSize); return { text: (e.innerText||'').replace(/\s+/g,' ').trim(), fs, x: r.left, y: r.top, w: r.width, h: r.height, cls: String(e.className).slice(0,60) }; });
};
const PSEL = process.env.PRICE_SEL;
const toBox = (p) => [Math.round(p.x*3), Math.round(p.y*3), Math.round((p.x+p.w)*3), Math.round((p.y+p.h)*3)];
console.log('PAGEPRICES0', JSON.stringify((await page.evaluate(PRICE_JS, PSEL)).slice(0,6).map(p=>[p.text, p.fs, ...toBox(p)])));
await page.addScriptTag({ content: us.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '') });
await page.waitForTimeout(+wait);
await page.mouse.move(1, 1).catch(()=>{});
const hasHost = await page.evaluate(() => !!document.getElementById('cashback-varsler-notice'));
console.log('HOST', hasHost);
// slå sammen seksjoner i panelet (som en bruker kan gjøre)
if (hasHost && process.env.COLLAPSE) {
  for (const name of process.env.COLLAPSE.split(',')) {
    const ok = await page.evaluate((name) => {
      const sr = document.getElementById('cashback-varsler-notice').shadowRoot;
      if (name.startsWith('.')) { const el = sr.querySelector(name); if (!el) return false; el.click(); return true; }
      const cand =[...sr.querySelectorAll('summary, button, [role=button], .section-toggle, div, span')].filter(e => (e.innerText||'').replace(/[▼▶\s]+/g,' ').trim() === name);
      const el = cand.find(e => e.tagName === 'SUMMARY') || cand.find(e => e.closest('summary')) || cand[0];
      if (!el) return false;
      (el.closest('summary') || el).click();
      return true;
    }, name.trim());
    console.log('collapse', name, ok);
    await page.waitForTimeout(500);
  }
  await page.mouse.move(1, 1).catch(()=>{});
  await page.waitForTimeout(500);
}
const panelTopCss = hasHost ? await page.evaluate(() => {
  const sr = document.getElementById('cashback-varsler-notice').shadowRoot;
  const rs = [...sr.querySelectorAll('*')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>300&&r.height>100);
  return Math.min(...rs.map(r=>r.top));
}) : 852;
console.log('PANELTOP_CSS', panelTopCss);
// scroll slik at prisen står rett over panelet (auto) eller på gitt y
if (process.env.SCROLLPRICE) {
  const ps = await page.evaluate(PRICE_JS, PSEL);
  const main = ps[+(process.env.PRICE_IDX || 0)];
  if (main) {
    const target = process.env.SCROLLPRICE === 'auto' ? panelTopCss - (+(process.env.GAPCSS || 28)) - main.h : +process.env.SCROLLPRICE;
    await page.evaluate(([y, t]) => window.scrollTo(0, Math.max(0, window.scrollY + y - t)), [main.y, target]);
    await page.waitForTimeout(1200);
  }
}
await page.mouse.move(1, 1).catch(()=>{});
// før-bilde: skjul panelet midlertidig
if (hasHost) await page.evaluate(() => { document.getElementById('cashback-varsler-notice').style.setProperty('display','none','important'); });
await page.waitForTimeout(300);
const pricesBefore = await page.evaluate(PRICE_JS, PSEL);
await page.screenshot({ path: out.replace('.png','-before.png') });
if (hasHost) await page.evaluate(() => { document.getElementById('cashback-varsler-notice').style.removeProperty('display'); });
await page.waitForTimeout(500);
await page.screenshot({ path: out });
const result = { url, scrollY: await page.evaluate(() => window.scrollY), panelTopPx: Math.round(panelTopCss*3), prices: pricesBefore.map(p=>({ text: p.text, fontSize: p.fs, box: toBox(p) })) };
console.log('PAGEPRICES', JSON.stringify(result.prices.slice(0,4)));
if (hasHost) {
  const boxes = await page.evaluate(() => {
    const host = document.getElementById('cashback-varsler-notice');
    const sr = host.shadowRoot;
    const all = [...sr.querySelectorAll('*')].filter(e => e.tagName !== 'STYLE');
    const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left*3), Math.round(r.top*3), Math.round(r.right*3), Math.round(r.bottom*3)]; };
    const txt = (e) => (e.innerText || '').replace(/\s+/g,' ').trim();
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < 393 && r.right > 0; };
    const header = all.filter(e=>vis(e) && /^(Prismatch|Cashback) hos/.test(txt(e))).sort((a,b)=>txt(a).length-txt(b).length)[0];
    const cards = all.filter(e => vis(e) && /price-match-card|offer-list|bonus-chip(?!-)|chip-group-items/.test(String(e.className)) && !/tooltip/.test(String(e.className)))
      .map(e=>({ cls: String(e.className).split(' ')[0] + (String(e.className).includes('--best') ? '--best' : ''), text: txt(e).slice(0,120), box: box(e), href: e.getAttribute('href') || undefined }));
    const sections = all.filter(e=>vis(e) && /^(▼|▶)?\s*(Prismatch|Ekstra cashback|Rabattkoder|GRATIS|PREMIUM)$/.test(txt(e)) && e.children.length <= 2).map(e=>({ text: txt(e), box: box(e) }));
    const panelEl = all.filter(vis).map(e=>[e, e.getBoundingClientRect()]).filter(([,r])=>r.width>300).sort((a,b)=>b[1].height-a[1].height)[0]?.[0];
    const tooltips = all.filter(e => /tooltip/.test(String(e.className)) && /visible/.test(String(e.className))).map(e=>({ text: txt(e).slice(0,60), box: box(e) }));
    return { panel: panelEl ? box(panelEl) : undefined, header: header ? { text: txt(header), box: box(header) } : undefined, cards, sections, tooltips };
  });
  Object.assign(result, boxes);
  await page.addStyleTag({ content: `html, body { background: transparent !important; } * { visibility: hidden !important; } #cashback-varsler-notice { visibility: visible !important; }` });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out.replace('.png','-panel.png'), omitBackground: true });
}
result.gm = gmLog;
writeFileSync(out.replace('.png','-boxes.json'), JSON.stringify(result, null, 1));
console.log('RESULT', JSON.stringify({ header: result.header, panel: result.panel, cards: result.cards?.map(c=>[c.cls, c.text, ...c.box]), tooltips: result.tooltips }));
await browser.close();
