// Offentlige sider (Kron, Euronext, Sparebørsen, NettBonus) på iPhone, scrollet til en tekst og eventuelt etter et trykk:
// node page-capture.mjs <url> <out.png> ["<tekst å scrolle til>"] ["<knappetekst å trykke>"]
// Avslår valgfrie samtykker. BOX=<regex> logger bokser (skjermbilde-px) for løvelementer som matcher.
import { chromium } from 'playwright';
const [,, url, out, scrollText, clickText] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
for (const label of [/^(avvis|avslå|kun nødvendige|bare nødvendige|reject all|decline|necessary only|lagre valg)/i]) {
  const button = page.getByRole('button', { name: label }).first();
  if (await button.isVisible().catch(() => false)) { await button.click(); await page.waitForTimeout(800); }
}
// Kron's floating chat button covers the chart and the list.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    if (el.textContent.trim() !== 'Chat') continue;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') { node.style.display = 'none'; break; }
    }
  }
});
if (clickText) {
  await page.getByRole('button', { name: clickText, exact: true }).first().click().catch((e) => console.log('CLICK', e.message));
  await page.waitForTimeout(1500);
}
if (scrollText) {
  const y = await page.evaluate((text) => {
    const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.trim().includes(text));
    if (!el) return null;
    scrollTo(0, Math.max(0, scrollY + el.getBoundingClientRect().top - 140));
    return Math.round(scrollY);
  }, scrollText);
  console.log('SCROLL', y);
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out });
if (process.env.BOX) {
  const re = process.env.BOX;
  const boxes = await page.evaluate((re) => [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && new RegExp(re, 'i').test(e.textContent) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().top < innerHeight)
    .map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 40), ...[r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3))]; }), re);
  for (const b of boxes) console.log(JSON.stringify(b));
}
await browser.close();
