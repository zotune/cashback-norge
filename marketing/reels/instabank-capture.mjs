// Instabank-videoene 55–57: node instabank-capture.mjs <out-dir>
// Fanger på iPhone (1179×2556):
//  - site-ad.png:   cashbacknorge.no med Instabank-annonsen øverst (trekningen tvunget til Instabank, som 80 % av besøkene)
//  - site-chip.png: «Ekstra cashback» åpnet med Instabank-raden under «Gratis» (🥳 Ad)
//  - site-tip.png:  samme rad med tooltipen åpen
//  - insta-nov.png / insta-des.png / insta-elbil.png: instabank.no/kredittkort/rabatter scrollet til teksten
// Logger bokser (skjermbilde-px) for elementene videoen markerer, og lagrer dem i <out-dir>/capture.json.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [,, out = 'shots/instabank'] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const newPage = async (random) => {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  if (random !== undefined) await ctx.addInitScript((r) => { Math.random = () => r; }, random);
  return ctx.newPage();
};
const box = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return null;
  const r = el.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3));
}, selector);
const log = { checked: new Date().toISOString(), boxes: {} };

// cashbacknorge.no
const site = await newPage(0.1);
await site.goto('https://cashbacknorge.no/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await site.waitForTimeout(2500);
await site.evaluate(() => { const a = document.getElementById('support-invite'); scrollTo(0, scrollY + a.getBoundingClientRect().top - 120); });
await site.waitForTimeout(600);
await site.screenshot({ path: `${out}/site-ad.png` });
log.boxes.ad = await box(site, '#support-invite');
log.boxes.adTitle = await box(site, '#support-invite-title');
log.boxes.adFine = await box(site, '#support-invite-fine-print');
log.boxes.adButton = await box(site, '#support-invite .invite-card-action');
log.adText = await site.evaluate(() => document.getElementById('support-invite').innerText);
await site.locator('.bonus-toggle').first().click();
await site.waitForTimeout(700);
const chipSel = '#free-chips .bonus-chip';
await site.evaluate((s) => { const c = [...document.querySelectorAll(s)].find((e) => e.innerText.includes('Instabank')); c.id = 'insta-chip'; scrollTo(0, scrollY + c.getBoundingClientRect().top - 330); }, chipSel);
await site.waitForTimeout(600);
await site.screenshot({ path: `${out}/site-chip.png` });
log.boxes.chip = await box(site, '#insta-chip');
log.chipText = await site.evaluate(() => document.getElementById('insta-chip').innerText.replace(/\s+/g, ' '));
const [cx, cy] = await site.evaluate(() => { const r = document.getElementById('insta-chip').getBoundingClientRect(); return [r.x + r.width * 0.3, r.y + r.height / 2]; });
await site.evaluate(() => document.getElementById('insta-chip').closest('.tooltip-wrap, .cbn-tooltip-row')?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
const info = site.locator('#insta-chip .cbn-tooltip-trigger, #insta-chip button').first();
if (await info.count()) await info.tap().catch(() => site.touchscreen.tap(cx, cy)); else await site.touchscreen.tap(cx, cy);
await site.waitForTimeout(900);
await site.screenshot({ path: `${out}/site-tip.png` });
log.tip = await site.evaluate(() => { const t = document.querySelector('.cbn-tooltip-open, .tooltip-wrap:hover .tooltip, .cbn-tooltip[data-open], [role=tooltip]'); if (!t) return null; const r = t.getBoundingClientRect(); return [t.innerText.slice(0, 600), ...[r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3))]; });

// instabank.no
const bank = await newPage();
await bank.goto('https://instabank.no/kredittkort/rabatter', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await bank.waitForTimeout(2500);
for (const label of [/^(avvis|avslå|kun nødvendige|bare nødvendige|lagre valg)/i]) {
  const b = bank.getByRole('button', { name: label }).first();
  if (await b.isVisible().catch(() => false)) { await b.click(); await bank.waitForTimeout(800); }
}
// The chat bubble covers text in the lower right corner.
await bank.addStyleTag({ content: 'iframe, [class*="chat" i], [id*="chat" i] { display: none !important; }' });
for (const [name, re] of [['nov', '^I november 2026 gir vi deg'], ['des', '^Desember'], ['elbil', '^Fast grønn rabatt']]) {
  const found = await bank.evaluate((re) => {
    const el = [...document.querySelectorAll('p, h1, h2, h3, h4, strong, span, div')].find((e) => new RegExp(re, 'i').test(e.textContent.trim()) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 600);
    if (!el) return null;
    el.id = `cap-${Math.random().toString(36).slice(2)}`;
    scrollTo(0, Math.max(0, scrollY + el.getBoundingClientRect().top - 330));
    return el.id;
  }, re);
  await bank.waitForTimeout(700);
  await bank.screenshot({ path: `${out}/insta-${name}.png` });
  log.boxes[name] = found && await box(bank, `#${found}`);
  log[`${name}Text`] = found && await bank.evaluate((id) => document.getElementById(id).innerText.slice(0, 300), found);
}
writeFileSync(`${out}/capture.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
await browser.close();
