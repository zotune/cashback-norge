import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, url, out] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.exposeBinding('__gmFetch', async (_s, d) => { try { const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data }); return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: '' }; } catch (e) { return { status: 0 }; } });
await ctx.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => { window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data }).then((r) => { if (!r.status) return d.onerror?.(r); d.onload?.({ ...r, readyState: 4, response: d.responseType === 'json' ? (() => { try { return JSON.parse(r.responseText); } catch { return null; } })() : r.responseText }); }); return { abort() {} }; };
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
for (const t of ['Godta alle', 'Tillat alle', 'Godta']) { const b = page.getByRole('button', { name: t }).first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; } }
await page.getByText(/^\s*lukk\s*$/i).first().click({ timeout: 4000 }).catch(() => console.log('no LUKK'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-before.png` });
await page.addScriptTag({ content: us });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${out}-after.png` });
const host = page.locator('#cashback-varsler-notice');
const shotPanel = async (name) => {
  const st = await page.addStyleTag({ content: 'html,body{background:transparent!important} *{visibility:hidden!important} #cashback-varsler-notice{visibility:visible!important}' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}-${name}.png`, omitBackground: true });
  await st.evaluate((n) => n.remove());
};
await shotPanel('panel');
// layout boxes inside the panel (css px)
const boxes = await host.evaluate((h) => [...h.shadowRoot.querySelectorAll('*')].filter((e) => e.children.length < 6 && /^(20 %|5,6 %|Rabattkoder|Cashback hos|15 %|3,9 %)/.test(e.innerText || '')).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, (e.innerText || '').split('\n')[0].slice(0, 30), Math.round(r.left * 3), Math.round(r.top * 3), Math.round(r.right * 3), Math.round(r.bottom * 3)]; }));
console.log(JSON.stringify(boxes));
// click first copy button
const copy = host.locator('button, [role=button]').filter({ has: host.locator('svg') });
const btns = await host.evaluate((h) => [...h.shadowRoot.querySelectorAll('button,[role=button]')].map((b) => [b.getAttribute('aria-label') || b.title || b.innerText.slice(0, 20), Math.round(b.getBoundingClientRect().left * 3), Math.round(b.getBoundingClientRect().top * 3)]));
console.log('BTNS', JSON.stringify(btns.slice(0, 40)));
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin }).catch(() => {});
await page.touchscreen.tap(167, 668);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}-copied.png` });
console.log('CLIP', await page.evaluate(() => navigator.clipboard.readText().catch(e => 'err ' + e)));
await page.waitForTimeout(2500);
const sumVal = process.env.SUM || '1000';
const sum = host.locator('input').first();
await sum.click();
for (let i = 0; i < sumVal.length; i++) { await sum.press(sumVal[i]); await page.waitForTimeout(250); await page.screenshot({ path: `${out}-sum${i + 1}.png` }); }
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}-sum.png` });
await shotPanel('panel-sum');
await browser.close();
