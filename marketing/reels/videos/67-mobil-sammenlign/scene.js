// Tek's cheapest plans per data tier on ice.no; the ≥20 GB tooltip lists the unlimited plans and iceMax.
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, countUp, sound, captions, endcard } = R;
  const c = window.CAPTURES.ice;
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const zero = c.cards.find(x => /^0 GB/.test(x.text)), free = c.cards.find(x => /^Fri data/.test(x.text)), twenty = c.cards.find(x => /^≥20 GB/.test(x.text));
  if (!zero || !free || !twenty) throw new Error('Missing captured boxes');
  // Tooltip rows measured in assets/ice-tip.png (row background runs at x=165).
  const troender = [150, 442, 1140, 608], iceMax = [150, 865, 1140, 1031];

  init('#panel', { y: 1800 });
  init(['#tip', '#card', '#end', '#fine', '#rule'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1200);
  init('#cam', { x: 540 - x, y: 1100 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  focus(0, { sx: 590, sy: 1300, s: 1.03, ty: 1150 }, 2.4, 'sine.inOut');

  popOut(at('panel') - .15, '#hook');
  focus(at('panel') - .1, { sx: 590, sy: 1400, s: 1, ty: 1040 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('panel'));
  sound(at('panel'), 'whoosh', .8);

  focus(at('tiers') - .1, { sx: 575, sy: (zero.box[1] + free.box[3]) / 2, s: 1.15, ty: 900 }, .5);
  popIn(at('tiers') + .1, '#ltiers', { from: .8 });
  ring(at('tiers', '70 kr'), zero.box, { hold: 1.2 });
  ring(at('tiers', '297 kr'), free.box, { good: true, hold: 1.4 });
  popOut(end('tiers') + .05, '#ltiers');

  tap(at('info', 'info'), (twenty.info[0] + twenty.info[2]) / 2, (twenty.info[1] + twenty.info[3]) / 2);
  tl.set('#tip', { opacity: 1 }, at('info', 'info') + .15);
  sound(at('info', 'info'), 'click', .7);
  focus(at('info', 'info') + .1, { ...center(iceMax), s: 1.25, ty: 760 }, .45);
  ring(at('info', '399 kr'), iceMax, { hold: 2 });

  focus(at('cheap') - .1, { ...center(troender), s: 1.25, ty: 760 }, .45);
  ring(at('cheap', '297 kr'), troender, { good: true, hold: 2.4 });
  sound(at('cheap', '297 kr'), 'ding', .7);

  const summary = end('cheap') - .9;
  tl.to('.dim', { opacity: 1, duration: .25 }, summary);
  popIn(summary, '#card', { xPercent: 0, from: .8 });
  countUp(summary + .15, '#saved', 102, { dur: .6 });
  popOut(at('rule') - .1, '#card', { xPercent: 0 });
  popIn(at('rule'), '#rule', { from: .7 });
  popIn(at('rule') + .3, '#fine', { xPercent: 0, from: .98 });
  sound(at('rule'), 'pop', .7);
  popOut(at('cta') - .1, '#rule');
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2, p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
