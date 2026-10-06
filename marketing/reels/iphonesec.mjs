import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto('https://cashbacknorge.no', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) { if (getComputedStyle(el).position === 'fixed') el.style.display = 'none'; } });
await page.screenshot({ path: 'shots/ios-0.png' });
const t = page.getByText('iPhone/iPad', { exact: false }).first();
const b = await t.boundingBox(); console.log('TOGGLE', JSON.stringify(b));
await t.click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/ios-1.png' });
console.log(await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await browser.close();
