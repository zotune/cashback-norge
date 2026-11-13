// Tax-free receipt vs Lyko (Combo Deal) for the same two products; Prisjakt rows from the captured panel.
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, sound, captions, endcard } = R;
  const L = window.CAPTURES.lumene, P = window.CAPTURES.pihl;
  const lp = L.cards.find(c => c.source === 'Prisjakt'), pp = P.cards.find(c => c.source === 'Prisjakt');
  if (!lp || !pp) throw new Error('Missing Prisjakt rows');
  // Lyko's own sale price under the heading (measured in assets/*-before.png).
  const lykoPrice = [48, 2270, 500, 2370];

  init(['#panel', '#panel2'], { y: 1800 });
  init(['#page2', '#card', '#end', '#fine', '#rule', '#receipt', '#rtag', '#hitL', '#hitP'], { opacity: 0 });
  const [x, y] = R.shotToStage(590, 1100);
  init('#cam', { x: 540 - x, y: 1100 - y, scale: 1, opacity: 0 });

  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  popIn(.4, '#receipt', { xPercent: 0, from: .85 });
  sound(.4, 'whoosh', .6);

  popOut(at('receipt') - .15, '#hook');
  popIn(at('receipt'), '#rtag', { xPercent: 0, from: .8 });
  tl.to('#receipt', { top: 380, duration: .5, ease: 'power3.out' }, at('receipt'));
  tl.to('#rtag', { top: 290, duration: .5, ease: 'power3.out' }, at('receipt'));
  tl.to('#hitL', { opacity: 1, duration: .25 }, at('receipt', 'Lumene-masken'));
  sound(at('receipt', '211,50'), 'ding', .6);

  // Lyko: the phone with the same mask.
  const tLyko = at('lyko') - .2;
  tl.to(['#receipt', '#rtag'], { opacity: 0, duration: .25 }, tLyko);
  tl.to('#cam', { opacity: 1, duration: .3 }, tLyko);
  focus(tLyko, { sx: 575, sy: 2150, s: 1.05, ty: 900 }, .5);
  ring(at('lyko', '179,25'), lykoPrice, { good: true, hold: .9 });
  tl.to('#panel', { y: 0, duration: .5, ease: 'power3.out' }, at('lyko', '179,25') + .9);
  sound(at('lyko', '179,25') + .9, 'whoosh', .7);
  focus(at('lyko', '179,25') + .9, { sx: 575, sy: (lp.box[1] + lp.box[3]) / 2, s: 1.25, ty: 760 }, .5);
  ring(at('lyko', '179,25') + 1.45, lp.box, { good: true, hold: 1 });

  // Camilla Pihl: receipt line, then Lyko.
  const tP = at('pihl') - .15;
  tl.to('#cam', { opacity: 0, duration: .2 }, tP);
  tl.set('#hitL', { opacity: 0 }, tP);
  tl.to(['#receipt', '#rtag'], { opacity: 1, duration: .25 }, tP);
  tl.to('#hitP', { opacity: 1, duration: .25 }, at('pihl', '188,10'));
  const tP2 = at('pihl', '174,30') - .25;
  tl.to(['#receipt', '#rtag'], { opacity: 0, duration: .2 }, tP2);
  tl.set(['#page', '#panel'], { opacity: 0 }, tP2);
  tl.set('#page2', { opacity: 1 }, tP2);
  tl.set('#panel2', { y: 0 }, tP2);
  tl.to('#cam', { opacity: 1, duration: .25 }, tP2);
  focus(tP2, { sx: 575, sy: (pp.box[1] + pp.box[3]) / 2, s: 1.25, ty: 760 }, .4);
  ring(at('pihl', '174,30') + .25, pp.box, { good: true, hold: 1.2 });
  sound(at('pihl', '174,30'), 'ding', .7);

  tl.to('.dim', { opacity: 1, duration: .25 }, at('total') - .1);
  popIn(at('total') - .1, '#card', { xPercent: 0, from: .8 });
  countUp(at('total'), '#saved', 46, { dur: .6 });
  popIn(at('total', 'Combo'), '#fine', { xPercent: 0, from: .98 });
  popOut(at('rule') - .1, '#card', { xPercent: 0 });
  popIn(at('rule'), '#rule', { from: .7 });
  sound(at('rule'), 'pop', .7);
  popOut(at('cta') - .1, '#rule');
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2, p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
