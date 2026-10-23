// Capture real Cashback Norge results and the public source for a member-benefit reel.
// node member-capture.mjs <video-name> [...]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2);
if (!names.length) throw new Error('Supply at least one video name.');
const browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader'] });
const rect = async locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect();
  return [r.left, r.top, r.right, r.bottom].map(n => Math.round(n * 3));
});
const firstVisible = async locator => {
  for (let i = 0; i < await locator.count(); i++) if (await locator.nth(i).isVisible()) return locator.nth(i);
  return null;
};
async function dismissCookies(page) {
  for (let pass = 0; pass < 3; pass++) {
    for (const frame of page.frames()) {
      const preferences = await firstVisible(frame.getByText(/^vis preferanser$/i));
      if (preferences) {
        await preferences.click();
        await frame.locator('input.consent-checkbox').evaluateAll(inputs => {
          for (const input of inputs) if (input.checked && !input.disabled) input.click();
        });
        const save = frame.getByRole('button', { name: /^lagre innstillinger$/i });
        await save.click();
        await save.waitFor({ state: 'hidden', timeout: 5000 });
      }
      for (const pattern of [/^avvis alle$/i, /kun nødvendige/i, /bare nødvendige/i, /reject all/i, /decline all/i, /avslå/i, /fortsett uten å godta/i]) {
        const button = await firstVisible(frame.getByRole('button', { name: pattern })) || await firstVisible(frame.getByText(pattern));
        if (button) { await button.click({ timeout: 2000 }).catch(() => {}); break; }
      }
    }
    await page.waitForTimeout(600);
  }
}
async function navigate(page, url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
      await page.waitForTimeout(2500);
      await dismissCookies(page);
      await page.evaluate(() => document.fonts.ready);
      return;
    } catch (error) {
      if (attempt === 2) throw new Error(`${url}: ${error.message}`);
    }
  }
}
async function position(page, locator, top = 190) {
  await locator.evaluate((el, top) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - top), top);
  await page.waitForTimeout(450);
}
async function capture(name) {
  const spec = JSON.parse(readFileSync(resolve(ROOT, 'videos', name, 'script.json'), 'utf8')).capture;
  const assets = resolve(ROOT, 'videos', name, 'assets');
  mkdirSync(assets, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'nb-NO', timezoneId: 'Europe/Oslo', colorScheme: 'light' });
  // Do not create marketing analytics events or mutate community data while capturing.
  await ctx.route(/gc\.zgo\.at|goatcounter\.com|google-analytics\.com|googletagmanager\.com/, route => route.abort());
  const page = await ctx.newPage();
  const meta = { capturedAt: new Date().toISOString(), sourceUrl: spec.source, merchant: spec.merchant, provider: spec.provider };
  try {
    const site = new URL('https://cashbacknorge.no/');
    site.searchParams.set('q', spec.merchant);
    site.searchParams.set('provider', spec.provider);
    meta.siteUrl = site.href;
    await navigate(page, site.href);
    const dismissInvite = page.getByRole('button', { name: 'Skjul invitasjonen' });
    if (await dismissInvite.isVisible()) await dismissInvite.click();
    await page.locator('.search').blur();
    // Results can use a verified shared name (e.g. Brilleavtaler) while the
    // query matches the merchant's domain. Capture the actual filtered result.
    const card = page.locator('.results .merchant').first();
    await card.waitFor({ state: 'visible', timeout: 20000 }).catch(async error => {
      await page.screenshot({ path: resolve(assets, 'blocked-site.png') });
      throw new Error(`${site.href}: ${error.message}; ${await page.locator('.results').innerText()}`);
    });
    await page.screenshot({ path: resolve(assets, 'site.png') });
    meta.site = { row: await rect(card.locator('.offer').first()), card: await rect(card) };
    await position(page, card, 240);
    await page.screenshot({ path: resolve(assets, 'offer.png') });
    meta.offer = { row: await rect(card.locator('.offer').first()), card: await rect(card), text: await card.innerText() };
    const info = card.locator('.cbn-tooltip-trigger').first();
    await info.click();
    const tip = page.locator('.cbn-tooltip-open').first();
    await tip.waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(assets, 'tip.png') });
    meta.tip = { row: await rect(tip), text: await tip.innerText() };
    await page.keyboard.press('Escape');
    if (spec.sum) {
      await page.locator('.global-sum').fill(spec.sum);
      await page.locator('.global-sum').blur();
      await position(page, card, 240);
      await page.screenshot({ path: resolve(assets, 'sum.png') });
      meta.sum = { row: await rect(card.locator('.offer').first()), text: await card.innerText() };
      if (!meta.sum.text.replace(/\s/g, '').includes('1500kr')) throw new Error('Expected 1 500 kr calculation was not shown.');
    }
    await navigate(page, spec.source);
    const heading = spec.heading ? page.getByRole('heading', { name: spec.heading, exact: true }).first() : page.locator('h1').first();
    await heading.waitFor({ state: 'visible', timeout: 15000 });
    let target = heading;
    if (spec.focusText) target = page.getByText(spec.focusText, { exact: true }).first();
    await target.waitFor({ state: 'visible', timeout: 10000 });
    await position(page, target, 230);
    const coverage = await target.evaluate(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 80));
      return { clear: hit === el || el.contains(hit), hit: hit?.tagName + '.' + hit?.className + ': ' + hit?.textContent?.trim().slice(0, 100) };
    });
    if (!coverage.clear) {
      await page.screenshot({ path: resolve(assets, 'blocked-source.png') });
      throw new Error(`${spec.source}: public source covered by ${coverage.hit}`);
    }
    await page.screenshot({ path: resolve(assets, 'source.png') });
    meta.source = { row: await rect(target), heading: await heading.innerText(), text: (await page.locator('body').innerText()).slice(0, 18000), url: page.url() };
    const terms = spec.termsText ? page.getByText(spec.termsText, { exact: true }).first() : page.getByRole('heading', { name: /vilkår/i }).first();
    if (await terms.count()) await position(page, terms, 230);
    else await position(page, heading, 160);
    await page.screenshot({ path: resolve(assets, 'terms.png') });
    meta.terms = { row: await rect(await terms.count() ? terms : heading) };
    writeFileSync(resolve(assets, 'capture.json'), JSON.stringify(meta, null, 2));
    writeFileSync(resolve(assets, 'capture.js'), 'window.SHOTS = ' + JSON.stringify(meta) + ';\n');
    console.log(JSON.stringify({ name, site: meta.offer.text.replace(/\s+/g, ' ').slice(0, 180), source: meta.source.heading, focus: meta.source.row }));
  } finally { await ctx.close(); }
}
try {
  let failed = false;
  for (let i = 0; i < names.length; i += 2) {
    const batch = names.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map(capture));
    results.forEach((result, index) => { if (result.status === 'rejected') { failed = true; console.error(batch[index] + ': ' + result.reason.stack); } });
  }
  if (failed) process.exitCode = 1;
} finally { await browser.close(); }
