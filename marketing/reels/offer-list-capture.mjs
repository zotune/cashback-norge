// /dagligvarer og /tilbud på iPhone for video 59–62 og 69–72: node offer-list-capture.mjs [video-name ...]
// Utfører trinnene i PLANS, lagrer videos/<navn>/assets/<shot>.png og capture.json (kilde, tidspunkt, tekst og
// DOM-bokser i skjermbilde-px). Annonselinjen og annonsekortet er skjult; ingen stemmer eller lagring.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const K = 3;
const SEARCH = '[data-ol="search"]';
const pick = (name, row) => `.deal-row:has(.deal-title:text-matches("${name}", "i"))${row ?? ''}`;
const PLANS = {
  '59-dagligvarer-kundeaviser': { path: '/dagligvarer/', steps: [
    { top: '.group-toggles', shot: 'liste', boxes: { chips: '.group-toggles', bar: '.list-bar', first: '.deal-row' } },
    { tap: ['[data-group="Bunnpris"]', '[data-group="Europris"]'], top: '.group-toggles', shot: 'butikker', boxes: { chips: '.group-toggles', count: '[data-ol="count"]' } },
    { tap: ['[data-group="Bunnpris"]', '[data-group="Europris"]'] },
    { sort: 'saving', top: '.deal-row', shot: 'rabatt', boxes: { first: '.deal-row', price: '.deal-row .deal-pricing' } },
    { search: 'ali kaffe', top: '.deal-row', shot: 'sok', boxes: { first: '.deal-row', search: '.search-wrap', days: '.deal-row .deal-validity' } },
  ] },
  '60-dagligvarer-betal-smart': { path: '/dagligvarer/', steps: [
    { top: '.group-toggles', shot: 'liste', boxes: { first: '.deal-row', card: '.deal-row .deal-meta .card-chip' } },
    { click: '[data-ol="bonus-toggle"]', top: '.group-toggles', shot: 'kort', boxes: { panel: '.bonus-chips-portal', trumf: '[data-ol="bonus-panel"] .bonus-chip >> nth=0', coop: '[data-ol="bonus-panel"] .bonus-chip >> nth=1' } },
    { click: '[data-ol="bonus-toggle"]' },
    { sort: 'unit', search: 'kaffe', top: '.deal-row', shot: 'kilopris', boxes: { first: '.deal-row', second: '.deal-row >> nth=1', third: '.deal-row >> nth=2' } },
  ] },
  '61-tilbud-kupp': { path: '/tilbud/', steps: [
    { search: 'torrentshell 3l jacket', top: '.deal-row', shot: 'kupp', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
    { search: 'qrevo edge 2 pro', top: '.deal-row', shot: 'laveste', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
  ] },
  '62-tilbud-fire-topplister': { path: '/tilbud/', steps: [
    { top: '.source-toggles', shot: 'kilder', boxes: { sources: '.source-row', first: '.deal-row' } },
    { click: '[data-group-pick="Data og gaming"]', top: '.source-toggles', shot: 'kategori', boxes: { chip: '[data-group-pick="Data og gaming"]', count: '[data-ol="count"]' } },
    { click: '[data-toplist="saving"]', top: '.deal-row', shot: 'prisfall', boxes: { first: '.deal-row', pricing: '.deal-row .deal-pricing', second: '.deal-row >> nth=1' } },
    { click: '[data-source="klarna"]', top: '.source-toggles', shot: 'velg-kilde', boxes: { chip: '[data-source="klarna"]', count: '[data-ol="count"]', sources: '.source-row' } },
  ] },
  '69-stable-rabatter': { path: '/tilbud/', steps: [
    { search: 'saros 20 sonic', top: '.deal-row', shot: 'tilbud', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
  ] },
  '71-julemat-kundeaviser': { path: '/dagligvarer/', steps: [
    { sort: 'unit', search: 'pinnekjøtt', top: '.deal-row', shot: 'pinne', boxes: { first: '.deal-row', second: '.deal-row >> nth=1', last: '.deal-row >> nth=-1', search: '.search-wrap' } },
    { sort: 'unit', search: 'tynnribbe', top: '.deal-row', shot: 'ribbe', boxes: { first: '.deal-row', second: '.deal-row >> nth=1', days: '.deal-row .deal-validity' } },
  ] },
  '72-tilbud-laveste-na': { path: '/tilbud/', steps: [
    { search: 'saros 20 sonic', top: '.deal-row', shot: 's1', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
    { search: 'galaxy watch8 40mm', top: '.deal-row', shot: 's2', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
    { search: 'wh-1000xm4', top: '.deal-row', shot: 's3', boxes: { row: '.deal-row', pricing: '.deal-row .deal-pricing', low: '.deal-row .deal-history-summary' } },
  ] },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLANS);
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
for (const name of names) {
  const plan = PLANS[name]; const dir = `videos/${name}/assets`; mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: K, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  await page.goto(`https://cashbacknorge.no${plan.path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.addStyleTag({ content: '.fixed-footer,.invite-card,.az-bar,.quokka-runner{display:none!important}' });
  const out = { source: `https://cashbacknorge.no${plan.path}`, capturedAt: new Date().toISOString(), viewport: [393, 852], shots: {} };
  for (const step of plan.steps) {
    for (const sel of step.tap ?? []) { await page.locator(sel).first().click(); await page.waitForTimeout(250); }
    if (step.click) { await page.locator(step.click).first().click(); await page.waitForTimeout(500); }
    if (step.sort) { await page.locator('[data-ol="sort"]').click(); await page.waitForTimeout(250); await page.locator(`.choice-menu [data-value="${step.sort}"]`).click(); await page.waitForTimeout(500); }
    if (step.search) { await page.locator(SEARCH).fill(step.search); await page.waitForTimeout(700); await page.evaluate(() => document.activeElement?.blur()); }
    if (step.top) await page.evaluate((sel) => { const e = document.querySelector(sel); const st = document.querySelector('.sticky-header'); const isSticky = st.contains(e); window.scrollTo({ top: isSticky ? st.getBoundingClientRect().top + scrollY - 2 : e.getBoundingClientRect().top + scrollY - st.offsetHeight - 10, behavior: 'instant' }); }, step.top);
    if (step.shot) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${dir}/${step.shot}.png` });
      const boxes = {};
      for (const [key, sel] of Object.entries(step.boxes ?? {})) {
        const l = page.locator(sel).first(); const b = await l.boundingBox().catch(() => null);
        boxes[key] = b ? { box: [b.x, b.y, b.x + b.width, b.y + b.height].map((v) => Math.round(v * K)), text: (await l.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160) } : null;
      }
      out.shots[step.shot] = boxes;
    }
  }
  writeFileSync(`${dir}/capture.json`, JSON.stringify(out, null, 1));
  console.log(name, JSON.stringify(out.shots));
  await ctx.close();
}
await browser.close();
