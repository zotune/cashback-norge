// Region-price and Pokepris reels use untouched screenshots and captured DOM boxes.
window.buildFeatureReel = function (R, config) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, countUp, sound, captions, endcard } = R;
  const capture = window.CAPTURE;
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const card = capture.cards[0];
  init('#panel', { y: 1800 });
  init(['#apple', '#tip', '#card', '#end', '#fine'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1350);
  init('#cam', { x: 540 - x, y: 1130 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(at('hook', config.hookToken), 'pop', .7);
  focus(0, { sx: 590, sy: config.hookY ?? 1100, s: 1.03, ty: 1050 }, 2.8, 'sine.inOut');

  popOut(at('store') - .15, '#hook');
  popIn(at('store'), '#lstore', { from: .8 });
  if (config.apple) tl.set('#apple', { opacity: 1 }, at('store'));
  const priceBox = config.apple ? [75, 1252, 1110, 1330]
    : capture.pagePrices.find(price => /1[.\s\u00a0]?699/.test(price.text) && price.box[1] > 0 && price.box[1] < 2556)?.box;
  if (!priceBox) throw new Error('Missing verified store-price box');
  const sourceFocus = config.apple ? center(priceBox) : { sx: 590, sy: priceBox[1] - 200 };
  focus(at('store'), { ...sourceFocus, s: 1.18, ty: 840 }, .5);
  ring(at('store', config.storeToken), priceBox, { hold: 1.6 });
  sound(at('store', config.storeToken), 'click', .7);
  popOut(end('store') + .05, '#lstore');

  tl.set('#apple', { opacity: 0 }, at('popup') - .15);
  focus(at('popup') - .1, { sx: 590, sy: config.panelY ?? 1300, s: 1, ty: 1030 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('popup'));
  sound(at('popup'), 'whoosh', .8);

  focus(at('best') - .1, { ...center(card.box), s: 1.4, ty: 810 }, .5);
  ring(at('best', config.bestToken), card.box, { good: true, hold: 2.0 });
  sound(at('best', config.bestToken), 'ding', .8);

  tap(at('info', 'info'), (card.info[0] + card.info[2]) / 2, (card.info[1] + card.info[3]) / 2);
  tl.set('#tip', { opacity: 1 }, at('info', 'info') + .15);
  sound(at('info', 'info'), 'click', .7);
  focus(at('info', 'info') + .1, { ...center(capture.tip.box), s: config.apple ? 1 : 1.18, ty: 730 }, .5);

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
