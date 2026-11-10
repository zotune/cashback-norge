// Komplett's «SPAR 1 500» vs each source's lowest registered price; saving uses known shipping.
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, sound, captions, endcard } = R;
  const c = window.CAPTURES.dreame;
  const price = name => c.pagePrices.find(p => p.text.replace(/\s/g, ' ').startsWith(name))?.box;
  const card = source => c.cards.find(x => x.source === source);
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const spar = price('SPAR'), now = price('1 490'), before = price('2 990');
  const klarna = card('Klarna'), prisjakt = card('Prisjakt');
  if (!spar || !now || !before || !klarna?.historyBox || !prisjakt?.historyBox) throw new Error('Missing captured boxes');

  init('#panel', { y: 1800 });
  init(['#card', '#end', '#fine', '#rule'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1300);
  init('#cam', { x: 540 - x, y: 1150 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  ring(at('hook') + .4, spar, { hold: 1.6 });
  focus(0, { sx: 590, sy: 1350, s: 1.05, ty: 1150 }, 2.6, 'sine.inOut');

  popOut(at('store') - .15, '#hook');
  popIn(at('store'), '#lstore', { from: .8 });
  focus(at('store'), { sx: 400, sy: 1410, s: 1.3, ty: 900 }, .5);
  ring(at('store') + .2, [now[0], now[1], Math.max(now[2], before[2]), before[3]], { hold: 1.8 });
  sound(at('store') + .2, 'click', .7);
  popOut(end('store') + .05, '#lstore');

  focus(at('popup') - .1, { sx: 590, sy: 1300, s: 1, ty: 1040 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('popup'));
  sound(at('popup'), 'whoosh', .8);

  focus(at('orange') - .1, { ...center(klarna.box), s: 1.45, ty: 820 }, .5);
  ring(at('orange') + .15, klarna.historyBox, { hold: 2 });
  popIn(at('orange') + .1, '#lorange', { from: .8 });
  sound(at('orange') + .15, 'click', .7);
  popOut(end('orange') + .05, '#lorange');

  focus(at('green') - .1, { ...center(prisjakt.box), s: 1.45, ty: 820 }, .5);
  ring(at('green') + .15, prisjakt.historyBox, { good: true, hold: 2.2 });
  popIn(at('green') + .1, '#lgreen', { from: .8 });
  sound(at('green') + .15, 'ding', .8);
  popOut(end('green') + .05, '#lgreen');

  const summary = at('sum') - .1;
  tl.to('.dim', { opacity: 1, duration: .25 }, summary);
  popIn(summary, '#card', { xPercent: 0, from: .8 });
  countUp(summary + .15, '#saved', 111, { dur: .7 });
  sound(summary + .75, 'kaching', .8);
  popOut(at('rule') - .1, '#card', { xPercent: 0 });
  popIn(at('rule'), '#rule', { from: .7 });
  popIn(at('rule') + .3, '#fine', { xPercent: 0, from: .98 });
  sound(at('rule'), 'pop', .7);
  popOut(at('cta') - .1, '#rule');
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2, p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
