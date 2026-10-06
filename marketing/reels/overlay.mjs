import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, url, out, wait='9000'] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8');
const browser = await chromium.launch({channel: process.env.CH || undefined, args:['--disable-gpu','--use-angle=swiftshader','--disable-blink-features=AutomationControlled']});
const ctx = await browser.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true, bypassCSP:true, locale:'nb-NO', timezoneId:'Europe/Oslo',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.exposeBinding('__gmFetch', async (_src, d) => {
  try {
    const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data });
    if (process.env.LOGGM) console.log('[gm]', r.status, d.method || 'GET', d.url.slice(0, 140));
    return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k,v])=>`${k}: ${v}`).join('\r\n') };
  } catch (e) { return { status: 0, error: String(e) }; }
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
await ctx.addCookies(['birthtime=470703601', 'lastagecheckage=1-0-1985', 'wants_mature_content=1', 'cookieSettings=%7B%22version%22%3A1%2C%22preference_state%22%3A1%2C%22content_customization%22%3Anull%2C%22valve_analytics%22%3Anull%2C%22third_party_analytics%22%3Anull%2C%22third_party_content%22%3Anull%2C%22utm_enabled%22%3Atrue%7D'].map((c) => { const [name, ...v] = c.split('='); return { name, value: v.join('='), domain: 'store.steampowered.com', path: '/' }; }));
const page = await ctx.newPage();
page.on('console', m => { if (/cashback|error/i.test(m.text())) console.log('[console]', m.text().slice(0,200)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+(process.env.PREWAIT || 2500));
// dismiss cookie banners best-effort
for (const t of ['Godta alle','Aksepter alle','Tillat alle','Godta','Jeg godtar','OK','Accept all','Lukk','LUKK']) {
  const b = page.getByRole('button', { name: t, exact: false }).first();
  if (await b.isVisible().catch(()=>false)) { await b.click().catch(()=>{}); break; }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: out.replace('.png','-before.png') });
console.log('PRICES', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-testid*=price], [class*=price], [class*=Price]')].map(e=>e.innerText.trim()).filter(t=>/\d/.test(t) && t.length<40).slice(0,8))));
const before = new Set(await page.evaluate(() => [...document.body.children].map((e,i)=>i)));
await page.addScriptTag({ content: us.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '') });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const hostId = await page.evaluate(() => document.getElementById('cashback-varsler-notice') ? 'cashback-varsler-notice' : undefined); console.log('PARENT', await page.evaluate(() => document.getElementById('cashback-varsler-notice')?.parentElement?.tagName));
console.log('HOST', hostId);
if (hostId) {
  const box = await page.evaluate((id) => { const el = document.getElementById(id).shadowRoot.firstElementChild; const kids=[...document.getElementById(id).shadowRoot.children].map(k=>{const r=k.getBoundingClientRect(); return [k.tagName,r.x,r.y,r.width,r.height]}); return kids; }, hostId);
  console.log('BOX', JSON.stringify(box));
  await page.addStyleTag({ content: `html, body { background: transparent !important; } * { visibility: hidden !important; } #${hostId} { visibility: visible !important; }` });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out.replace('.png','-panel.png'), omitBackground: true });
}
if (process.env.SUM) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.addScriptTag({ content: us.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '') });
  await page.waitForTimeout(+wait);
  const host = page.locator('#cashback-varsler-notice');
  const sum = host.locator('input').first();
  await sum.click();
  for (const ch of process.env.SUM) { await sum.press(ch); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: out.replace('.png','-sum.png') });
  console.log('SUMTEXT', (await host.evaluate(h => h.shadowRoot.textContent)).slice(0, 600));
}

await browser.close();
