// Bursdagsfordeler: userscriptet på en ekte butikkside + tooltip og Sum-felt.
// node bday-capture.mjs <url> <out-prefix> [sum]   → <prefix>-before/panel/tip/sum.png + TIPTEXT/BOX-logg
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, url, out, sum] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: process.env.UA || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await ctx.exposeBinding('__gmFetch', async (_src, d) => {
  try {
    const r = await fetch(d.url, { method: d.method || 'GET', headers: d.headers || {}, body: d.data, signal: AbortSignal.timeout(30000) });
    return { status: r.status, responseText: await r.text(), finalUrl: r.url, responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n') };
  } catch (e) { return { status: 0, error: String(e) }; }
});
await ctx.addInitScript(() => {
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
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+(process.env.PREWAIT || 3000));
for (const t of ['Godta alle', 'Aksepter alle', 'Tillat alle', 'Godta', 'Jeg godtar', 'Accept all', 'OK', 'Lukk']) {
  const b = page.getByRole('button', { name: t, exact: false }).first();
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
}
await page.waitForTimeout(1500);
if (process.env.HIDE) await page.addStyleTag({ content: `${process.env.HIDE} { display: none !important; }` });
await page.screenshot({ path: `${out}-before.png` });
await page.addScriptTag({ content: us });
await page.waitForTimeout(+(process.env.WAIT || 9000));
await page.screenshot({ path: `${out}.png` });
const host = page.locator('#cashback-varsler-notice');
const rows = await host.evaluate((h) => [...h.shadowRoot.querySelectorAll('*')].filter((e) => /Gratis bursdag/.test(e.textContent) && e.children.length === 0).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, e.className, Math.round(r.x * 3), Math.round(r.y * 3), Math.round(r.right * 3), Math.round(r.bottom * 3)]; }));
console.log('CHIP', JSON.stringify(rows));
const ONLY = `html, body { background: transparent !important; } body * { visibility: hidden !important; } #cashback-varsler-notice { visibility: visible !important; }`;
const only = async (path) => {
  const h = await page.addStyleTag({ content: ONLY });
  await page.waitForTimeout(300);
  await page.screenshot({ path, omitBackground: true });
  await h.evaluate((el) => el.remove());
};
await only(`${out}-panel.png`);
if (sum) {
  const input = host.locator('input').first();
  await input.focus();
  for (const ch of sum) { await page.keyboard.press(ch); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}-sum.png` });
  await only(`${out}-sum-panel.png`);
  const r = await host.evaluate((h) => [...h.shadowRoot.querySelectorAll('*')].filter((e) => e.children.length === 0 && /kr/.test(e.textContent)).slice(0, 12).map((e) => { const b = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 60), ...[b.x, b.y, b.right, b.bottom].map((v) => Math.round(v * 3))]; }));
  console.log('SUMROWS', JSON.stringify(r));
}
// Tooltip: tap the info trigger on the birthday row
const info = await host.evaluate((h) => {
  const chip = [...h.shadowRoot.querySelectorAll('.provider-gratisbursdag')].find((e) => e.getBoundingClientRect().height > 0);
  let row = chip; while (row && !row.querySelector('.cbn-tooltip-trigger')) row = row.parentElement;
  const btn = row?.querySelector('.cbn-tooltip-trigger');
  if (!btn) return null; const r = btn.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, ...[r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3))];
});
console.log('INFO', JSON.stringify(info));
if (info) {
  await page.touchscreen.tap(info[0], info[1]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}-tip.png` });
  await only(`${out}-tip-panel.png`);
  const tip = await host.evaluate((h) => { const t = h.shadowRoot.querySelector('.cbn-tooltip-open'); if (!t) return null; const r = t.getBoundingClientRect(); return { text: t.innerText, box: [r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3)) }; });
  console.log('TIP', JSON.stringify(tip));
}
await browser.close();
