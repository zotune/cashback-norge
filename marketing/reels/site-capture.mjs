// cashbacknorge.no på mobil med URL-parametre: node site-capture.mjs "<query>" <out-prefix> [scrollY,...]
// Tar skjermbilde av første skjerm, fullside og valgte scrollposisjoner. Logger kort med posisjon.
import { chromium } from 'playwright';
const [,, query, out, scrolls = ''] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', colorScheme: process.env.SCHEME || 'light',
  userAgent: process.env.UA || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto(`${process.env.BASE || 'https://cashbacknorge.no/'}${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(+(process.env.WAIT || 4000));
if (process.env.HIDEFIXED) await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (getComputedStyle(el).position === 'fixed') el.style.display = 'none'; });
await page.screenshot({ path: `${out}.png` });
for (const y of scrolls.split(',').filter(Boolean)) {
  await page.evaluate((y) => window.scrollTo(0, +y), y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}-${y}.png` });
}
if (process.env.TAP) {
  const b = await page.evaluate(() => { const t = [...document.querySelectorAll('.results .cbn-tooltip-trigger')].find((e) => e.getBoundingClientRect().height > 0); if (!t) return null; t.scrollIntoView({ block: 'center' }); return true; });
  await page.waitForTimeout(500);
  const box = await page.evaluate(() => { const t = [...document.querySelectorAll('.results .cbn-tooltip-trigger')].find((e) => e.getBoundingClientRect().height > 0); const r = t?.getBoundingClientRect(); return r && [r.x + r.width / 2, r.y + r.height / 2]; });
  console.log('TRIGGER', JSON.stringify(box));
  if (box) {
    await page.screenshot({ path: `${out}-pretap.png` });
    await page.touchscreen.tap(box[0], box[1]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}-tip.png` });
    console.log('TIP', JSON.stringify(await page.evaluate(() => { const t = document.querySelector('.cbn-tooltip-open'); if (!t) return null; const r = t.getBoundingClientRect(); return [t.innerText.slice(0, 400), ...[r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3))]; })));
  }
}
const cards = await page.evaluate(() => [...document.querySelectorAll('.results > *')].slice(0, 80).map((c) => { const r = c.getBoundingClientRect(); return [Math.round((r.top + scrollY) * 3), Math.round(r.height * 3), c.innerText.replace(/\s+/g, ' ').slice(0, 110)]; }));
for (const c of cards) console.log(JSON.stringify(c));
await browser.close();
