// Android-guiden på cashbacknorge.no/android/, ett skjermbilde per steg: node android-guide.mjs <out-prefix>
import { chromium } from 'playwright';
const [,, out] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO',
  userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0' });
for (let step = 0; step < 5; step++) {
  const page = await ctx.newPage();
  await page.addInitScript((s) => { try { localStorage.setItem('cashback-android-step', String(s)); } catch {} }, step);
  await page.goto('https://cashbacknorge.no/android/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(+(process.env.WAIT || 2600));
  await page.screenshot({ path: `${out}-${step}.png` });
  await page.close();
}
await browser.close();
