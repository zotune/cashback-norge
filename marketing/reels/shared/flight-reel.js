// Flight price-match reels (video 45–): untouched iPhone screenshots from flight-capture.mjs and the
// captured DOM boxes in window.CAPTURES. The page shows first, the panel slides in, the source row is
// ringed, the info tooltip opens and a summary card counts up the difference.
window.buildFlightReel = function (R, config) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, countUp, sound, captions, endcard } = R;
  const capture = window.CAPTURES[config.capture ?? 'a'];
  const center = (box) => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const card = capture.cards.find((item) => item.source === config.source);
  if (!card) throw new Error(`Missing captured ${config.source} row`);
  if (!capture.tip || capture.tip.source !== config.source) throw new Error(`Missing ${config.source} tooltip`);

  init('#panel', { y: 1800 });
  init(['#tip', '#card', '#end', '#fine'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1200);
  init('#cam', { x: 540 - x, y: 1130 - y, scale: 1 });

  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(at('hook', config.hookToken), 'pop', .7);
  focus(0, { sx: 590, sy: config.hookY ?? 900, s: 1.03, ty: 1050 }, 2.8, 'sine.inOut');

  popOut(at('store') - .15, '#hook');
  popIn(at('store'), '#lstore', { from: .8 });
  focus(at('store'), { sx: 590, sy: config.storeY ?? 700, s: 1.12, ty: 900 }, .5);
  popOut(end('store') + .05, '#lstore');

  focus(at('popup') - .1, { sx: 590, sy: config.panelY ?? 1700, s: 1, ty: 1030 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('popup'));
  sound(at('popup'), 'whoosh', .8);
  if (capture.chips?.box && config.chipsToken) {
    ring(at('popup', config.chipsToken), capture.chips.box, { hold: 1.6 });
  }

  focus(at('best') - .1, { ...center(card.box), s: 1.4, ty: 810 }, .5);
  ring(at('best', config.bestToken), card.box, { good: true, hold: 2.0 });
  sound(at('best', config.bestToken), 'ding', .8);

  tap(at('info', 'info'), (card.info[0] + card.info[2]) / 2, (card.info[1] + card.info[3]) / 2);
  tl.set('#tip', { opacity: 1 }, at('info', 'info') + .15);
  sound(at('info', 'info'), 'click', .7);
  const tipFocusY = config.tipY ?? capture.tip.box[1] + 420;
  focus(at('info', 'info') + .1, { sx: 645, sy: tipFocusY, s: config.tipScale ?? 1.3, ty: 820 }, .5);

  const summary = at('sum') - .1;
  tl.to('.dim', { opacity: 1, duration: .25 }, summary);
  popIn(summary, '#card', { xPercent: 0, from: .8 });
  countUp(summary + .15, '#saved', config.difference, { dur: .7 });
  sound(summary + .75, 'kaching', .8);
  popIn(at('terms'), '#fine', { xPercent: 0, from: .98 });
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  popOut(at('cta') - .1, '#card', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2,
    p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
