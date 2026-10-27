// Shared pacing for the offer reels 33–36. Each step cuts to a screenshot layer, focuses on a box,
// shows its label for the segment and rings the box at a spoken word. An optional card sums up.
//
// window.buildScene = R => window.buildOfferScene(R, {
//   hook: { word: "Temu", box: [x0, y0, x1, y1] },          // first layer, shown from the start
//   steps: [{ seg: "site", layer: "#site", box: [...], word: "NettBonus", label: "#l1" }],
//   card: { seg: "card", word: "150 kr", total: 150, emoji: "💸" },
// });
window.buildOfferScene = function (R, { hook, steps, card }) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init(["#end", ".flash", "#fine", ".label", "#card"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const center = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const [hx, hy] = R.shotToStage(...center(hook.box));
  init("#cam", { x: 540 - hx, y: 950 - hy, scale: 1 });
  let active = steps[0].layer;
  const cut = (t, next) => {
    if (next === active) return;
    tl.set(active, { opacity: 0 }, t);
    tl.set(next, { opacity: 1 }, t);
    tl.fromTo(".flash", { opacity: 0.35 }, { opacity: 0, duration: 0.2, immediateRender: false }, t);
    sound(t, "whoosh", 0.35);
    active = next;
  };
  const focusBox = (t, box, scale, dur, ty) => {
    const [sx, sy] = center(box);
    focus(t, { sx, sy, s: scale, ty }, dur);
  };

  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", hook.word));
  sound(at("hook", hook.word), "pop", 0.7);
  focusBox(0, hook.box, 1.1, 2.2, 990);
  popOut(end("hook") + 0.05, "#hook");
  popIn(at(steps[0].seg), "#fine", { xPercent: 0, from: 0.95 });

  for (const step of steps) {
    const t = at(step.seg);
    cut(t - 0.1, step.layer);
    focusBox(t - 0.1, step.box, step.scale ?? 1.3, step === steps[0] ? 0.5 : 0.01, step.ty ?? 860);
    if (step.label) {
      popIn(t, step.label, { from: 0.8 });
      popOut(end(step.seg) + 0.02, step.label);
    }
    const tw = step.word ? at(step.seg, step.word) : t + 0.3;
    ring(tw, step.ring ?? step.box, { good: true, hold: Math.max(0.8, end(step.seg) - tw - 0.1), pad: 8 });
    sound(tw, step.sound ?? "ding", 0.7);
  }

  if (card) {
    const tc = at(card.seg) - 0.1;
    tl.to(".dim", { opacity: 1, duration: 0.25 }, tc);
    popIn(tc, "#card", { xPercent: 0, from: 0.75 });
    // A whole-krone total counts up; a total with øre (such as 132,8 kr) is written in the card.
    if (card.total !== undefined) countUp(tc + 0.3, "#total", card.total, { dur: Math.max(0.8, at(card.seg, card.word) - tc - 0.3) });
    sound(at(card.seg, card.word), "kaching", 0.9);
    burst(at(card.seg, card.word) + 0.1, card.emoji ?? "💸", { x: 540, y: 760, n: 10 });
    // A card right before the end card stays until it; one in the middle gives way to the next step.
    if (at("cta") - end(card.seg) < 0.5) popOut(at("cta") - 0.1, "#card", { xPercent: 0 });
    else {
      popOut(end(card.seg) + 0.05, "#card", { xPercent: 0 });
      tl.to(".dim", { opacity: 0, duration: 0.25 }, end(card.seg) + 0.05);
    }
  }
  popOut(at("cta") - 0.15, "#fine", { xPercent: 0 });
  endcard(at("cta") - 0.12, { free: at("cta") + 0.15, p1: at("cta") + 0.4, p2: at("cta") + 0.6, p3: at("cta") + 0.85 });
  captions({ skip: ["cta"] });
};
