// Full-page capture of cashbacknorge.no search: node sitefull.mjs <query> <out.png>
import { chromium } from 'playwright';
const [,, q, out] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto('https://cashbacknorge.no', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.position === 'fixed') el.style.display = 'none'; } });
const prefixes = [];
for (let i = 0; i <= q.length; i++) prefixes.push(q.slice(0, i));
for (const p of prefixes) {
  await page.locator('input.search').first().fill(p);
  await page.waitForTimeout(700);
  await page.screenshot({ path: out.replace('.png', `-type${p.length}.png`) });
}
await page.addStyleTag({ content: '.sticky-header{position:static!important} .az-bar{display:none!important}' });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
const cards = await page.evaluate(() => [...document.querySelectorAll('.results > *')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height), c.innerText.split('\n').filter(l => l.length < 40 && l !== '•').slice(0, 14).join(' | ')]; }));
for (const c of cards) console.log(JSON.stringify(c));
const find = process.argv.slice(4);
const boxes = await page.evaluate((find) => find.map(f => { const [card, txt] = f.split('::'); const c = [...document.querySelectorAll('.results > *')].find(e => e.innerText.startsWith(card)); if (!c) return [f, null]; const row = [...c.querySelectorAll('*')].filter(e => e.innerText && e.innerText.trim().startsWith(txt) && e.getBoundingClientRect().height < 60 && e.getBoundingClientRect().height > 20).pop(); const r = (row || c).getBoundingClientRect(); return [f, [r.left, r.top + scrollY, r.right, r.bottom + scrollY].map(v => Math.round(v * 3))]; }), find);
console.log('BOXES', JSON.stringify(boxes));
await browser.close();
