// Flight price-match reels on desktop airline sites (video 49–): two untouched screenshots taken by the user
// in their own browser (assets/a.png: site + panel, assets/b.png: same search with a row's tooltip open).
// The airline sites block automated browsers, so there is no captured DOM; boxes are screenshot px.
// The camera starts on the airline's own price, pans to the panel, rings the best row, fades to the
// tooltip shot and scrolls through it before the summary card.
window.buildDeskFlightReel = function (R, c) {
  const { tl, init, at, end, ring, popIn, popOut, countUp, sound, captions, endcard, K, $ } = R;
  for (const img of document.querySelectorAll('.screen.desk img')) img.style.width = img.naturalWidth * K + 'px';
  const shotA = $('#shota img');
  $('.screen.desk').style.height = shotA.naturalHeight * K + 'px';

  // Camera move that keeps the screenshot covering the stage where the zoom allows it (no empty background
  // beside or below the browser); otherwise the whole screenshot stays on the stage.
  const [X0, Y0] = R.shotToStage(0, 0);
  const W = 1020, H = shotA.naturalHeight * K;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const focus = (t, { sx, sy, s, tx = 540, ty = 900 }, dur = .6, ease = 'power3.inOut') => {
    const [px, py] = R.shotToStage(sx, sy);
    tx = W * s >= 1080 ? clamp(tx, 1080 - (X0 + W - px) * s, (px - X0) * s) : 540 + ((px - X0) - (X0 + W - px)) * s / 2;
    ty = H * s >= 1920 ? clamp(ty, 1920 - (Y0 + H - py) * s, (py - Y0) * s) : clamp(ty, (py - Y0) * s, 1920 - (Y0 + H - py) * s);
    tl.to('#cam', { x: tx - px * s, y: ty - py * s, scale: s, duration: dur, ease }, t);
  };
  const mid = (b) => ({ sx: (b[0] + b[2]) / 2, sy: (b[1] + b[3]) / 2 });
  // Scale that fits a screenshot box into maxW × maxH stage px, capped so text stays sharp.
  const fit = (b, maxW = 960, maxH = 880, cap = 4.6) => Math.min(maxW / ((b[2] - b[0]) * K), maxH / ((b[3] - b[1]) * K), cap);
  // Rings live inside the zoomed camera, so the stroke is divided by the zoom at that moment.
  const mark = (t, box, s, opts = {}) => {
    const el = ring(t, box, { pad: 10 / s, ...opts });
    Object.assign(el.style, { borderWidth: 8 / s + 'px', borderRadius: 18 / s + 'px',
      boxShadow: `0 0 ${30 / s}px ${opts.good ? 'rgba(25,194,107,.6)' : 'rgba(255,59,59,.5)'}` });
  };
  const show = (t, sel) => tl.to(sel, { opacity: 1, duration: .3 }, t);

  $('#fine').style.top = $('#card').getBoundingClientRect().bottom + 24 + 'px';
  init(['#shotb', '#card', '#end', '#fine'], { opacity: 0 });
  init('.label', { xPercent: -50 });

  // HOOK: the whole browser window, slowly pushing in.
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(at('hook', c.hookToken), 'pop', .7);
  focus(0, { sx: c.hookFocus?.[0] ?? shotA.naturalWidth / 2, sy: c.hookFocus?.[1] ?? shotA.naturalHeight / 2, s: 1.12, ty: 1020 }, 2.8, 'sine.inOut');

  // STORE: the airline's own price.
  popOut(at('store') - .15, '#hook');
  popIn(at('store'), '#lstore', { from: .8 });
  const siteScale = fit(c.siteView, 1000, 760, 3.2);
  focus(at('store') - .1, { ...mid(c.siteView), s: siteScale, ty: 900 }, .6);
  mark(at('store', c.siteToken), c.site, siteScale, { hold: 1.8 });
  sound(at('store', c.siteToken), 'click', .7);
  if (c.site2) {
    const scale2 = fit(c.siteView2, 1000, 760, 3.2);
    focus(at('store', c.site2Token) - .35, { ...mid(c.siteView2), s: scale2, ty: 900 }, .5);
    mark(at('store', c.site2Token), c.site2, scale2, { hold: 1.6 });
    sound(at('store', c.site2Token), 'click', .7);
  }
  popOut(end('store') + .05, '#lstore');

  // POPUP: pan to the panel; the extension icon pulses.
  const rowsScale = fit(c.rows, 980, 900, 3.6);
  focus(at('popup') - .1, { ...mid(c.rows), s: rowsScale, ty: 860 }, .65);
  tl.to('#ext', { background: 'rgba(31,143,95,.25)', scale: 1.25, duration: .2, yoyo: true, repeat: 3 }, at('popup'));
  sound(at('popup'), 'whoosh', .8);
  if (c.showBAt === 'popup') show(at('popup') - .1, '#shotb');
  if (c.chips) mark(at('popup', c.chipsToken), c.chips, rowsScale, { hold: 1.8 });
  if (c.showBAt === 'best') show(at('best') - .25, '#shotb');

  // BEST row in the panel.
  const best = c.bestB ?? c.best;
  if (c.bestRows) focus(at('best') - .2, { ...mid(c.bestRows), s: fit(c.bestRows, 980, 900, 3.6), ty: 860 }, .45);
  const bestScale = c.bestRows ? fit(c.bestRows, 980, 900, 3.6) : rowsScale;
  mark(at('best', c.bestToken), best, bestScale, { good: true, hold: 2.2 });
  sound(at('best', c.bestToken), 'ding', .8);
  if (c.secondBest) mark(at('best', c.secondToken), c.secondBest, bestScale, { good: true, hold: 1.6 });

  // INFO: the tooltip shot, scrolled from the summary down through the hit list.
  const tInfo = at('info', c.infoToken);
  if (!c.showBAt) show(tInfo - .2, '#shotb');
  sound(tInfo, 'click', .7);
  const tip = c.tip;
  const tipScale = fit(tip, 1000, 99999, 4.6);
  const half = 560 / (tipScale * K);
  focus(tInfo - .1, { sx: mid(tip).sx, sy: Math.min(tip[1] + half, mid(tip).sy), s: tipScale, ty: 880 }, .6);
  if (tip[3] - tip[1] > 2 * half) {
    focus(tInfo + .7, { sx: mid(tip).sx, sy: tip[3] - half, s: tipScale, ty: 880 }, Math.max(at('sum') - tInfo - 1.0, .6), 'sine.inOut');
  }
  if (c.tipMark) mark(at('info', c.tipMarkToken ?? c.infoToken) + .25, c.tipMark, tipScale, { good: true, hold: 1.8 });

  // SUMMARY card, terms and end card.
  const summary = at('sum') - .1;
  tl.to('.dim', { opacity: 1, duration: .25 }, summary);
  popIn(summary, '#card', { xPercent: 0, from: .8 });
  countUp(summary + .15, '#saved', c.difference, { dur: .7 });
  sound(summary + .75, 'kaching', .8);
  popIn(at('terms'), '#fine', { xPercent: 0, from: .98 });
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  popOut(at('cta') - .1, '#card', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2,
    p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
