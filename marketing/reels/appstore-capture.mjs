// App Store-side på mobil (Android-UA, siden iPhone-UA sendes til App Store-appen), scrollet til tekst:
// node appstore-capture.mjs <url> <out.png> "<tekst som finnes i elementet>"
// Logger bokser (skjermbilde-px) for elementer som inneholder kr-priser.
import { chromium } from 'playwright';
const [,, url, out, text] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: process.env.UA || 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
// Kjøp i app ligger i en lukket <details>
await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
await page.waitForTimeout(500);
const y = await page.evaluate((text) => {
  const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.includes(text));
  if (!el) return null; el.scrollIntoView({ block: 'center' }); return Math.round(scrollY);
}, text);
await page.waitForTimeout(800);
console.log('SCROLL', y);
await page.screenshot({ path: out });
const rows = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /kr/.test(e.textContent) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().top < innerHeight)
  .map((e) => { const r = e.getBoundingClientRect(); const row = e.parentElement?.parentElement; return [row?.innerText.replace(/\s+/g, ' ').slice(0, 60), ...[r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3))]; }));
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
