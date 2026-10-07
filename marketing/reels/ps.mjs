// Capture PlayStation Store region prices + scroll to chosen rows. node ps.mjs <url> <outprefix> <Region1,Region2>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, url, out, want = 'USA,Norge'] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.exposeBinding('__gmFetch', async (_s, d) => { try { const r = await ctx.request.fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, data: d.data, timeout: 30000 }); return { status: r.status(), responseText: await r.text(), finalUrl: r.url(), responseHeaders: '' }; } catch (e) { return { status: 0 }; } });
await ctx.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => { window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data }).then((r) => { if (!r.status) return d.onerror?.(r); d.onload?.({ ...r, readyState: 4, response: d.responseType === 'json' ? (() => { try { return JSON.parse(r.responseText); } catch { return null; } })() : r.responseText }); }); return { abort() {} }; };
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 20; i++) { let hit = false; for (const n of ['Tillat alle', 'Godta']) { const b = page.getByRole('button', { name: n, exact: true }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); hit = true; break; } } if (hit) break; await page.waitForTimeout(500); }
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-before.png` });
const priceBox = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-qa*=finalPrice], [data-qa*=price]')].find((e) => /kr/.test(e.innerText) && e.getBoundingClientRect().height > 0); if (!el) return null; const r = el.getBoundingClientRect(); return [el.innerText, ...[r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 3))]; });
console.log('PRICE', JSON.stringify(priceBox));
await page.addScriptTag({ content: us });
await page.waitForTimeout(25000);
await page.mouse.move(2, 2);
await page.screenshot({ path: `${out}-after.png` });
const host = page.locator('#cashback-varsler-notice');
const rows = async () => host.evaluate((h) => [...h.shadowRoot.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 40 && r.height < 70 && r.width > 250 && /kr/.test(e.innerText || ''); }).map((e) => { const r = e.getBoundingClientRect(); return [(e.innerText || '').replace(/\n/g, ' | ').slice(0, 60), ...[r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 3))]; }));
const all = await rows();
console.log('ROWS', JSON.stringify(all));
let i = 1;
for (const name of want.split(',')) {
  await host.evaluate((h, name) => { const el = [...h.shadowRoot.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.innerText || '').trim() === name)[0]; el?.scrollIntoView({ block: 'center' }); }, name);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}-scroll${i}.png` });
  console.log('SCROLL' + i, name, JSON.stringify((await rows()).filter((r) => r[0].includes(name))));
  i++;
}
await browser.close();
