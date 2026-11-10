// Reviews in the panel, «Kopier til AI», and Claude's answer to that exact prompt (ai-answer.html).
window.buildScene = R => {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard, K } = R;
  const c = window.CAPTURES.qr798;
  const center = box => ({ sx: (box[0] + box[2]) / 2, sy: (box[1] + box[3]) / 2 });
  const row = pattern => c.reviews.find(r => pattern.test(r.text));
  const buyers = row(/Kjøpere/), test = row(/Eksperter/), store = row(/Om butikken/);
  if (!buyers || !test || !store || !c.copy) throw new Error('Missing captured boxes');
  const aiHeight = 5052 * K;  // ai-full.png is 1179 × 5052
  const scroll = -(aiHeight + 150 - 1665);  // 150 px top margin keeps the label off its heading

  init('#panel', { y: 1800 });
  init(['#copied', '#ai', '#end', '#fine'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const [x, y] = R.shotToStage(590, 1300);
  init('#cam', { x: 540 - x, y: 1150 - y, scale: 1 });
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  sound(.1, 'pop', .7);
  focus(0, { sx: 590, sy: 1250, s: 1.03, ty: 1150 }, 2.6, 'sine.inOut');

  popOut(at('panel') - .15, '#hook');
  focus(at('panel') - .1, { sx: 590, sy: 1500, s: 1, ty: 1040 }, .5);
  tl.to('#panel', { y: 0, duration: .55, ease: 'power3.out' }, at('panel'));
  sound(at('panel'), 'whoosh', .8);

  focus(at('scores') - .1, { sx: 575, sy: (buyers.box[1] + test.box[3]) / 2, s: 1.4, ty: 820 }, .5);
  ring(at('scores', '8'), test.scoreBox, { good: true, hold: 1.4 });
  ring(at('scores', 'Kjøpere'), buyers.scoreBox, { good: true, hold: 1.6 });
  popIn(at('scores') + .1, '#lscores', { from: .8 });
  sound(at('scores', '8'), 'ding', .7);
  popOut(end('scores') + .05, '#lscores');

  focus(at('store') - .1, { ...center(store.box), s: 1.4, ty: 820 }, .45);
  ring(at('store') + .1, store.box, { hold: 1.4 });
  popIn(at('store') + .1, '#lstore', { from: .8 });
  popOut(end('store') + .05, '#lstore');

  focus(at('copy') - .1, { ...center(c.copy), s: 1.6, ty: 820 }, .45);
  ring(at('copy', 'Kopier'), c.copy, { good: true, hold: 1 });
  tap(at('copy', 'AI') , (c.copy[0] + c.copy[2]) / 2, (c.copy[1] + c.copy[3]) / 2);
  tl.set('#copied', { opacity: 1 }, at('copy', 'AI') + .12);
  sound(at('copy', 'AI'), 'click', .8);

  focus(at('paste') - .1, { sx: 590, sy: 1278, s: 1, ty: 1040 }, .5);
  tl.fromTo('#ai', { opacity: 0, y: 140 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }, at('paste') + .2);
  popIn(at('paste') + .3, '#lai', { from: .8 });
  sound(at('paste') + .2, 'whoosh', .8);

  tl.to('#ai img', { y: scroll, duration: end('result') - at('result') + .2, ease: 'sine.inOut' }, at('result'));
  popIn(at('result') + .2, '#fine', { xPercent: 0, from: .98 });
  popOut(at('cta') - .1, '#lai');
  popOut(at('cta') - .1, '#fine', { xPercent: 0 });
  endcard(at('cta') - .1, { free: at('cta', 'Gratis'), p1: at('cta', 'Gratis') + .2, p2: at('cta', 'Gratis') + .4, p3: at('cta', 'cashbacknorge.no') });
  captions({ skip: ['cta'] });
};
