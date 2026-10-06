import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'nb-NO', timezoneId: 'Europe/Oslo', bypassCSP: true });
await ctx.exposeBinding('__gmFetch', async (_s, d) => { try { const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data }); return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: '' }; } catch (e) { return { status: 0 }; } });
await ctx.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_xmlhttpRequest = (d) => { window.__gmFetch({ url: d.url, method: d.method, headers: d.headers, data: d.data }).then((r) => { if (!r.status) return d.onerror?.(r); d.onload?.({ ...r, readyState: 4, response: d.responseType === 'json' ? (() => { try { return JSON.parse(r.responseText); } catch { return null; } })() : r.responseText }); }); return { abort() {} }; };
});
const page = await ctx.newPage();
const consent = async () => { for (const t of ['Tillat alle cookies', 'Godta alle', 'Godta', 'Aksepter alle', 'Accept all', 'Jeg godtar']) { const b = page.getByRole('button', { name: t }).first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(800); return; } } };
const target = process.argv[2], name = process.argv[3];
if (target === 'site') {
  await page.goto('https://cashbacknorge.no', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `shots/${name}.png` });
  const l = page.getByText('Chrome-extension').first();
  console.log('LINK', JSON.stringify(await l.boundingBox()), await l.getAttribute('href'));
} else {
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000); await consent();
  await page.getByText(/^\s*lukk\s*$/i).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/${name}-before.png` });
  await page.addScriptTag({ content: us });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: `shots/${name}-after.png` });
  const boxes = await page.locator('#cashback-varsler-notice').evaluate((h) => [...h.shadowRoot.querySelectorAll('*')].filter((e) => e.children.length < 4 && /^(Prismatch hos|Hair247|335|297|Rabattkoder|5,6 %|20 %)/.test((e.innerText || '').trim())).map((e) => { const r = e.getBoundingClientRect(); return [(e.innerText || '').trim().split('\n')[0].slice(0, 24), Math.round(r.left * 2), Math.round(r.top * 2), Math.round(r.right * 2), Math.round(r.bottom * 2)]; }).filter((b) => b[3] > 0));
  console.log('BOXES', JSON.stringify(boxes));
}
await browser.close();
