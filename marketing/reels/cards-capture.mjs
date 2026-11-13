// Fanger enkeltkort på cashbacknorge.no (mobil) med målte bokser: node cards-capture.mjs "<query>" <assets-dir> "<Butikk 1>|<Butikk 2>|…"
// For hver butikk: scroller kortet til ca. 40 % av skjermen, tar <slug>.png og logger kortets og hver tilbudsrads boks
// (skjermbilde-px, ×3) med tekst i capture.json. BASE= for lokal server. Ingen klikk, ingen lagring.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const [,, query, dir, names = ''] = process.argv;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', colorScheme: 'light',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const base = process.env.BASE || 'https://cashbacknorge.no/';
await page.goto(`${base}${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
const out = { source: `${base}${query}`, capturedAt: new Date().toISOString(), shots: {} };
const slug = (s) => s.toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const name of names.split('|').filter(Boolean)) {
  const found = await page.evaluate(([name, top]) => {
    const card = [...document.querySelectorAll('.results > *')].find((c) => c.querySelector('.merchant-name')?.textContent.trim().toLowerCase() === name.toLowerCase()) ??
      [...document.querySelectorAll('.results > *')].find((c) => c.querySelector('.merchant-name')?.textContent.trim().toLowerCase().startsWith(name.toLowerCase()));
    if (!card) return false;
    window.scrollTo(0, card.getBoundingClientRect().top + scrollY - innerHeight * top);
    return true;
  }, [name, Number(process.env.TOP ?? 0.35)]);
  if (!found) { console.log('MISSING', name); continue; }
  await page.waitForTimeout(700);
  const file = `${slug(name)}.png`;
  await page.screenshot({ path: `${dir}/${file}` });
  const boxes = await page.evaluate((name) => {
    const k = 3, box = (r) => [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * k));
    const card = [...document.querySelectorAll('.results > *')].find((c) => c.querySelector('.merchant-name')?.textContent.trim().toLowerCase() === name.toLowerCase()) ??
      [...document.querySelectorAll('.results > *')].find((c) => c.querySelector('.merchant-name')?.textContent.trim().toLowerCase().startsWith(name.toLowerCase()));
    return { card: box(card.getBoundingClientRect()), rows: [...card.querySelectorAll('.cbn-row.offer, .offer-wrap')].filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => ({ box: box(e.getBoundingClientRect()), text: e.innerText.replace(/\s+/g, ' ').slice(0, 120) })) };
  }, name);
  out.shots[file] = { name, ...boxes };
  console.log(file, JSON.stringify(boxes));
}
writeFileSync(`${dir}/capture.json`, JSON.stringify(out, null, 1));
await browser.close();
