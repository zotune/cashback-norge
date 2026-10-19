// 18 – Bursdagsrabatter i nettbutikken: Glitter, Dæhlie, Ringo, Outland (ekte skjermbilder 19. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, sound, captions, endcard } = R;
  init(["#end", ".flash", "#fine"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1300);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };
  const ROW = [132, 1030, 1018, 1156];

  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "bursdag"));
  sound(at("hook", "bursdag"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1300, s: 1.08, ty: 1130 }, 2.4, "sine.inOut");
  popOut(at("intro") - 0.1, "#hook");
  focus(at("intro"), { sx: 589, sy: 1300, s: 1.2, ty: 1000 }, 0.6);
  popIn(at("intro"), "#fine", { xPercent: 0, from: 0.95 });

  const items = [["glit", "#glitter", null, "#l1", "25 %"], ["dahl", "#dahlie", "#glitter", "#l2", "20 %"], ["ringo", "#ringo", "#dahlie", "#l3", "20 %"], ["out", "#outland", "#ringo", "#l4", "10 %"]];
  items.forEach(([id, show, hide, lbl, word], i) => {
    if (hide) { cut(at(id) - 0.1, show, hide); focus(at(id) - 0.1, { sx: 580, sy: 1095, s: 1.5, ty: 820 }, 0.01); }
    else focus(at(id) - 0.15, { sx: 580, sy: 1095, s: 1.5, ty: 820 }, 0.5);
    label(at(id), lbl, end(id) + 0.1);
    ring(at(id, word), ROW, { good: true, hold: 0.8 });
    sound(at(id, word), "ding", 0.8);
  });

  focus(at("count") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.6);
  label(at("count"), "#l5", end("count") + 0.2);
  sound(at("count", "60"), "kaching", 0.9);
  popOut(end("count") + 0.1, "#fine", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.2, p2: at("cta", "gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
