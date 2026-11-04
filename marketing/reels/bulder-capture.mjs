// Video 58: Bulder boliglån og vervebonus på iPhone. node bulder-capture.mjs videos/58-bulder/assets
// Avslår valgfrie cookies og skjuler alle rentetall (prosent, kr/mnd, renteendring), siden et rentetall
// krever et renteeksempel. Lagrer skjermbilder, kildetekst og bokser (skjermbilde-px) i capture.json.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [,, dir = 'videos/58-bulder/assets'] = process.argv;
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const result = { checked: new Date().toISOString(), shots: {} };

async function open(url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('GOTO', url, e.message));
  await page.waitForTimeout(2500);
  const decline = page.getByRole('button', { name: 'Godta nødvendige', exact: true }).first();
  if (await decline.isVisible().catch(() => false)) { await decline.click(); await page.waitForTimeout(800); }
  // No interest rates on screen: hide every block that states a rate, a monthly cost or a rate change.
  await page.evaluate(() => {
    const re = /\d\s*%|kr\/mnd|renteendring|nominell rente/i;
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[data-hidden-rate]')) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      if (!re.test(own) && !(el.children.length === 0 && re.test(el.textContent))) continue;
      const block = el.closest('li, p, section, form') || el;
      block.style.visibility = 'hidden';
      block.setAttribute('data-hidden-rate', '');
    }
  });
}

async function shot(name, scrollText, phrases, offset = 140) {
  if (scrollText) {
    await page.evaluate(([text, offset]) => {
      const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent.includes(text));
      if (el) scrollTo(0, Math.max(0, scrollY + el.getBoundingClientRect().top - offset));
    }, [scrollText, offset]);
  } else await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/${name}.png` });
  const boxes = await page.evaluate((phrases) => {
    const out = {};
    for (const [key, text] of Object.entries(phrases)) {
      const el = [...document.querySelectorAll('body *')].filter((e) => e.textContent.includes(text) && e.getBoundingClientRect().height > 0)
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!el) { out[key] = null; continue; }
      const r = el.getBoundingClientRect();
      out[key] = { text: el.textContent.trim().slice(0, 400), box: [r.x, r.y, r.right, r.bottom].map((v) => Math.round(v * 3)) };
    }
    return out;
  }, phrases);
  const visibleRates = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && /\d\s*%|kr\/mnd/.test(e.textContent) && !e.closest('[data-hidden-rate]'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; })
    .map((e) => e.textContent.trim()));
  result.shots[name] = { url: page.url(), boxes, visibleRates };
  console.log(name, JSON.stringify(result.shots[name]));
}

await open('https://www.bulder.no/boliglan');
await shot('lan', null, { hero: 'Å flytte boliglånet til Bulder er smart', claim: 'automatisk lavere rente' });
await shot('lan-month', 'Til kundens beste', { month: 'Vi sjekker boligverdien og lånesummen hver måned', para: 'Prismodellen vår fungerer bare til kundens beste' });
await open('https://www.bulder.no/om-oss/vilkaar/bonus-verving');
await shot('verv', 'Vilkår bonus verving', { both: 'får 500 kr i bonus', charity: 'gies videre til veldedighet', link: 'Verving kan bare gjøres' }, 60);
await shot('verv-link', 'Følgende vilkår gjelder', { link: 'Verving kan bare gjøres', paid: 'Bonusen utbetales når' }, 140);
writeFileSync(`${dir}/capture.json`, JSON.stringify(result, null, 1));
await browser.close();
