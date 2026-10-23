// Shared pacing for the five member-benefit reels. Uses actual capture coordinates.
window.buildMemberScene = function (R, config) {
  const { tl, init, at, end, focus, ring, popIn, popOut, sound, captions, endcard } = R;
  const shots = window.SHOTS;
  init(['#end', '.flash', '#fine', '.label'], { opacity: 0 });
  init('.label', { xPercent: -50 });
  const center = box => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const sourceBox = [...shots.source.row];
  sourceBox[3] += config.sourceExpand;
  const [sx, sy] = center(sourceBox);
  const [hx, hy] = R.shotToStage(sx, sy);
  init('#cam', { x: 540 - hx, y: 950 - hy, scale: 1 });
  let active = '#source';
  const cut = (t, next) => {
    if (next === active) return;
    tl.set(active, { opacity: 0 }, t);
    tl.set(next, { opacity: 1 }, t);
    tl.fromTo('.flash', { opacity: .35 }, { opacity: 0, duration: .2, immediateRender: false }, t);
    sound(t, 'whoosh', .35);
    active = next;
  };
  const focusBox = (t, box, scale = 1.35, duration = .5, ty = 850) => {
    const [sx, sy] = center(box);
    focus(t, { sx, sy, s: scale, ty }, duration);
  };
  const label = (id, selector) => {
    popIn(at(id), selector, { from: .82 });
    popOut(end(id) + .02, selector);
  };
  const showSite = id => {
    const t = at(id);
    cut(t - .05, '#home');
    focusBox(t - .05, shots.site.card, 1.05, .05, 940);
    label(id, '#l1');
    sound(t + .15, 'click', .45);
    cut(t + .7, '#offer');
    focusBox(t + .7, shots.offer.row, 1.3, .3, 850);
    ring(t + 1.05, shots.offer.row, { good: true, hold: Math.max(.7, end(id) - t - 1.2), pad: 6 });
  };
  const showSource = id => {
    cut(at(id) - .05, '#source');
    focusBox(at(id) - .05, sourceBox, 1.3, .25, 850);
    label(id, '#l2');
    ring(at(id) + .2, sourceBox, { good: true, hold: Math.max(.8, end(id) - at(id) - .3), pad: 6 });
    sound(at(id) + .25, 'ding', .6);
  };
  tl.fromTo('#hook', { scale: .9 }, { scale: 1, duration: .35, ease: 'back.out(3)' }, 0);
  focusBox(0, sourceBox, 1.1, 2.5, 990);
  sound(.2, 'pop', .6);
  popOut(at('find') - .12, '#hook');
  popIn(at('find'), '#fine', { xPercent: 0, from: .95 });
  if (config.siteSegment === 'find') {
    showSite('find');
    if (config.proofShot === 'sum') {
      cut(at('proof') - .05, '#sum');
      focusBox(at('proof') - .05, shots.sum.row, 1.25, .3, 860);
      label('proof', '#l2');
      ring(at('proof') + .4, shots.sum.row, { good: true, hold: Math.max(1, end('proof') - at('proof') - .5) });
      sound(at('proof') + .7, 'kaching', .55);
    } else showSource('proof');
  } else {
    showSource('find');
    showSite('proof');
  }
  cut(at('terms') - .05, '#terms');
  focusBox(at('terms') - .05, shots.terms.row, 1.18, .3, 870);
  label('terms', '#l3');
  sound(at('terms') + .1, 'click', .4);
  popOut(at('cta') - .15, '#fine', { xPercent: 0 });
  endcard(at('cta') - .12, { free: at('cta') + .15, p1: at('cta') + .45, p2: at('cta') + .7, p3: at('cta') + 1 });
  captions({ skip: ['cta'] });
};
