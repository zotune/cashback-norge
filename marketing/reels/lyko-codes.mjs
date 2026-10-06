// Capture the community discount-code UI (vote up/down, add own code) on Lyko.
// All writes to Supabase (vote, submit-code, …) are intercepted and mocked – nothing reaches the real DB.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, url, out] = process.argv;
const us = readFileSync(new URL('../../site/cashback-varsler.user.js', import.meta.url), 'utf8').replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, '');
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
let votes = 0;
await ctx.route(/supabase\.co\/functions\/v1\//, async (route) => {
  const u = route.request().url();
  const body = route.request().postDataJSON?.() ?? {};
  let res = {};
  if (u.endsWith('/vote')) res = body.vote === 1 ? { upvotes: 1, downvotes: 0, registered_id: 9001 + votes++ } : { upvotes: 0, downvotes: 1, registered_id: 9001 + votes++ };
  else if (u.endsWith('/submit-code')) res = { ok: true, id: 9100 };
  else if (u.endsWith('/my-votes')) res = { votes: [] };
  else if (u.endsWith('/owned-codes')) res = { ids: [] };
  console.log('[mock]', u.split('/').pop(), JSON.stringify(body), '→', JSON.stringify(res));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
});
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
await page.getByText(/^\s*lukk\s*$/i).first().click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}-before.png` });
await page.addScriptTag({ content: us });
await page.waitForTimeout(12000);
await page.mouse.move(2, 2);
const host = page.locator('#cashback-varsler-notice');
const shot = async (name) => { await page.mouse.move(2, 2); await page.waitForTimeout(350); await page.screenshot({ path: `${out}-${name}.png` }); };
const boxes = async () => host.evaluate((h) => {
  const q = (sel) => [...h.shadowRoot.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return [e.className, (e.innerText || '').trim().slice(0, 24), ...[r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 3))]; });
  return { votes: q('.vote-btn'), add: q('.add-code-btn'), inputs: q('.add-code-input, .add-code-submit'), rows: q('.code-item-row') };
});
await shot('c0');
console.log('BOXES0', JSON.stringify(await boxes()));
const vb = host.locator('.vote-btn');
// row 1: upvote (second vote-btn in the row), row 4: downvote (first vote-btn)
const clickAt = async (loc) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); };
const snap = (name) => page.screenshot({ path: `${out}-${name}.png` });
await clickAt(vb.nth(1)); await page.waitForTimeout(700); await snap('c1');
await page.mouse.move(2, 2); await page.waitForTimeout(300); await snap('c1b');
await clickAt(vb.nth(6)); await page.waitForTimeout(700); await snap('c2');
// the downvoted row moves to "Utgåtte koder" before mouseleave fires, so its tooltip sticks – clear it
await host.evaluate((h) => h.shadowRoot.querySelectorAll('.copy-code-tooltip.visible').forEach((t) => t.classList.remove('visible')));
const neutral = async () => { await page.touchscreen.tap(160, 187); await page.waitForTimeout(500); };
await shot('c2b');
console.log('BOXES2', JSON.stringify(await boxes()));
await host.locator('.add-code-btn').first().tap(); await page.waitForTimeout(500); await shot('c3');
console.log('BOXES3', JSON.stringify(await boxes()));
const reward = host.locator('.add-reward-input'); const code = host.locator('.add-code-input:not(.add-reward-input)');
await reward.tap(); await reward.pressSequentially('15', { delay: 120 });
await code.tap();
let i = 0; for (const ch of 'EKSEMPEL15') { await code.press(ch === ch.toLowerCase() ? ch : ch); if (++i % 2 === 0) await shot(`t${i / 2}`); }
await shot('c4');
await host.locator('.add-code-submit').tap(); await page.waitForTimeout(1200); await host.evaluate((h) => h.shadowRoot.querySelectorAll('.copy-code-tooltip.visible').forEach((t) => t.classList.remove('visible'))); await shot('c5');
console.log('BOXES5', JSON.stringify(await boxes()));
await browser.close();
