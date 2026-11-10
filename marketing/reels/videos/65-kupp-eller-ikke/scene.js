// Two-round quiz: is Komplett's «SPAR» price each source's lowest registered price?
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, popIn, popOut, sound, captions, endcard } = R;
  const tv = window.CAPTURES.samsung, robot = window.CAPTURES.dreame;
  const price = (c, name) => c.pagePrices.find(p => p.text.replace(/\s/g, ' ').startsWith(name))?.box;
  const card = (c, source) => c.cards.find(x => x.source === source);
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const tvSpar = price(tv, 'SPAR'), tvNow = price(tv, '8 990'), robotSpar = price(robot, 'SPAR'), robotNow = price(robot, '1 490');
  const tvCards = ['Prisjakt', 'Godpris', 'Klarna'].map(s => card(tv, s));
  const klarna = card(robot, 'Klarna'), prisjakt = card(robot, 'Prisjakt');
  if (!tvSpar || !tvNow || !robotSpar || !robotNow || tvCards.some(c => !c?.historyBox) || !klarna?.historyBox || !prisjakt) throw new Error('Missing captured boxes');

  init(['#panel1', '#panel2'], { y: 1800 });
  init(['#page2', '#end', '#fine', '#score'], { opacity: 0 });
  init(['.q', '.verdict', '.side', '.count'], { xPercent: (i, el) => el.classList.contains('count') ? 0 : -50 });
  const [x, y] = R.shotToStage(590, 1300);
  init('#cam', { x: 540 - x, y: 1150 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  focus(0, { sx: 590, sy: 1300, s: 1.03, ty: 1150 }, 2.4, 'sine.inOut');

  const round = (n, spar, now, count) => {
    popOut(at(`r${n}`) - .15, n === 1 ? '#hook' : '#v1');
    popIn(at(`r${n}`), `#q${n}`, { from: .8 });
    focus(at(`r${n}`), { sx: 360, sy: (spar[1] + now[3]) / 2, s: 1.35, ty: 920 }, .5);
    ring(at(`r${n}`) + .25, [spar[0], spar[1], Math.max(spar[2], now[2]), now[3]], { hold: 2.2 });
    sound(at(`r${n}`) + .25, 'click', .7);
    ['Tre', 'to', 'en…'].forEach((word, i) => {
      const t = at(`r${n}count`, word);
      const el = `#c${3 - i}`;
      tl.fromTo(el, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: .18, ease: 'power2.out' }, t);
      tl.to(el, { opacity: 0, scale: .7, duration: .18 }, t + .36);
      sound(t, 'click', .5);
    });
    popOut(at(`r${n}count`) - .05, `#q${n}`);
  };

  round(1, tvSpar, tvNow);
  tl.to('#panel1', { y: 0, duration: .5, ease: 'power3.out' }, at('r1reveal') - .2);
  focus(at('r1reveal') - .2, { sx: 575, sy: (tvCards[0].box[1] + tvCards[2].box[3]) / 2, s: 1.3, ty: 900 }, .5);
  popIn(at('r1reveal'), '#v1', { from: .6 });
  sound(at('r1reveal'), 'kaching', .8);
  tvCards.forEach((c, i) => ring(at('r1reveal') + .35 + i * .25, c.historyBox, { good: true, hold: 2.2 - i * .25 }));

  tl.set('#page2', { opacity: 1 }, at('r2') - .2);
  tl.set('#panel1', { opacity: 0 }, at('r2') - .2);
  round(2, robotSpar, robotNow);
  tl.to('#panel2', { y: 0, duration: .5, ease: 'power3.out' }, at('r2reveal') - .2);
  focus(at('r2reveal') - .2, { ...center(klarna.box), s: 1.45, ty: 860 }, .5);
  popIn(at('r2reveal'), '#v2', { from: .6 });
  sound(at('r2reveal'), 'pop', .8);
  ring(at('r2reveal') + .3, klarna.historyBox, { hold: 2 });

  popOut(at('r2best') - .1, '#v2');
  focus(at('r2best') - .1, { ...center(prisjakt.box), s: 1.45, ty: 860 }, .5);
  ring(at('r2best') + .15, prisjakt.box, { good: true, hold: 2.2 });
  popIn(at('r2best') + .1, '#best', { from: .8 });
  sound(at('r2best', '111 kr'), 'ding', .8);
  popIn(at('r2best') + .4, '#fine', { xPercent: 0, from: .98 });

  popOut(at('comment') - .1, '#best');
  tl.to('.dim', { opacity: 1, duration: .25 }, at('comment') - .1);
  tl.fromTo('#score', { opacity: 0, scale: .7 }, { opacity: 1, scale: 1, duration: .35, ease: 'back.out(2.2)' }, at('comment'));
  sound(at('comment'), 'pop', .7);
  popOut(at('cta') - .1, '#score');
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'gratis'), p1: at('cta', 'gratis') + .2, p2: at('cta', 'gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta', 'r1count', 'r2count'] });
};
