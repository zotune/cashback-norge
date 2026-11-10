// Forbrukerrådet's cheapest spot agreements on fjordkraft.no; Fjordkraft's own plan from the tooltip.
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, countUp, sound, captions, endcard } = R;
  const c = window.CAPTURES.fjordkraft;
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const oslo = c.cards.find(x => /NO1/.test(x.text) && /729/.test(x.text));
  if (!oslo || !c.tip) throw new Error('Missing captured boxes');
  // Tooltip rows measured in assets/fjordkraft-tip.png (row background runs at x=165).
  const agva = [150, 283, 1140, 506], fjordkraft = [150, 1885, 1140, 2159];

  init('#panel', { y: 1800 });
  init(['#tip', '#card', '#end', '#fine'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1200);
  init('#cam', { x: 540 - x, y: 1100 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  focus(0, { sx: 590, sy: 1300, s: 1.03, ty: 1150 }, 2.6, 'sine.inOut');

  popOut(at('page') - .15, '#hook');
  popIn(at('page'), '#lpage', { from: .8 });
  focus(at('page'), { sx: 400, sy: 1800, s: 1.25, ty: 1000 }, .5);
  popOut(end('page') + .05, '#lpage');

  focus(at('panel') - .1, { sx: 590, sy: 1300, s: 1, ty: 1040 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('panel'));
  sound(at('panel'), 'whoosh', .8);

  focus(at('cheap') - .1, { ...center(oslo.box), s: 1.45, ty: 820 }, .5);
  ring(at('cheap', '729 kr'), oslo.box, { good: true, hold: 2 });
  popIn(at('cheap') + .1, '#lcheap', { from: .8 });
  sound(at('cheap', '729 kr'), 'ding', .8);
  popOut(end('cheap') + .05, '#lcheap');

  tap(at('info', 'info'), (oslo.info[0] + oslo.info[2]) / 2, (oslo.info[1] + oslo.info[3]) / 2);
  tl.set('#tip', { opacity: 1 }, at('info', 'info') + .15);
  sound(at('info', 'info'), 'click', .7);
  focus(at('info', 'info') + .1, { ...center(agva), s: 1.2, ty: 700 }, .45);
  focus(at('info', 'Fjordkraft'), { ...center(fjordkraft), s: 1.2, ty: 820 }, .6);
  ring(at('info', 'Fjordkraft') + .3, fjordkraft, { hold: 1.8 });

  const summary = at('sum') - .1;
  tl.to('.dim', { opacity: 1, duration: .25 }, summary);
  popIn(summary, '#card', { xPercent: 0, from: .8 });
  countUp(summary + .15, '#saved', 133, { dur: .7 });
  sound(summary + .75, 'kaching', .8);
  popIn(at('terms'), '#fine', { xPercent: 0, from: .98 });
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  popOut(at('cta') - .1, '#card', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2, p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
