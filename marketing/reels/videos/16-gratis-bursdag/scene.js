// 16 – Gratis bursdag: filteret på cashbacknorge.no + tooltips for gratisvarer (ekte skjermbilder 19. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard } = R;
  init(["#end", ".flash", "#chip", "#fine"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1500);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "gratis"));
  sound(at("hook", "gratis"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1500, s: 1.08, ty: 1130 }, 3.0, "sine.inOut");

  // INTRO – the Gratis bursdag filter with 60 stores
  popOut(at("intro") - 0.1, "#hook");
  focus(at("intro") - 0.1, { sx: 589, sy: 1300, s: 1.35, ty: 900 }, 0.6);
  ring(at("intro", "bursdagsfordeler"), [24, 1377, 393, 1472], { good: true, hold: 1.4 });
  popIn(at("intro", "bursdagsfordeler"), "#chip");
  sound(at("intro", "bursdagsfordeler"), "ding", 0.8);
  ring(at("intro", "gratisbursdag.no"), [896, 1139, 1091, 1184], { good: true, hold: 0.6 });
  popOut(end("intro") + 0.05, "#chip");

  // FREEBIES – one tooltip each; the camera frames the tooltip title, Krav-line and row
  const items = [["esp", "#espresso", "#list", "#l1"], ["narv", "#narvesen", "#espresso", "#l2"], ["godt", "#godtbrod", "#narvesen", "#l3"], ["meny", "#meny", "#godtbrod", "#l4"]];
  items.forEach(([id, show, hide, lbl], i) => {
    const t = at(id) - 0.1;
    cut(t, show, hide);
    focus(t, { sx: 640, sy: 1250, s: 1.25, ty: 980 }, i === 0 ? 0.4 : 0.01);
    label(at(id) + 0.05, lbl, end(id) + 0.1);
    ring(at(id) + 0.15, [230, 960, 1150, 1025], { good: true, hold: 0.7 });
    ring(at(id) + 0.9, [230, 1200, 1150, 1265], { good: true, hold: 0.6 });
    sound(at(id) + 0.15, "ding", 0.7);
  });

  // TERMS – status line and tap on the i
  focus(at("terms") - 0.1, { sx: 640, sy: 1450, s: 1.35, ty: 900 }, 0.5);
  tap(at("terms", "info-knappen"), 653, 1793);
  ring(at("terms", "gyldighet"), [230, 1270, 1150, 1325], { good: true, hold: 0.7 });
  ring(at("terms", "bekreftet"), [230, 1400, 1150, 1465], { good: true, hold: 0.9 });
  sound(at("terms", "bekreftet"), "pop", 0.6);
  popIn(at("terms"), "#fine", { xPercent: 0, from: 0.95 });
  popOut(end("count") + 0.1, "#fine", { xPercent: 0 });

  // COUNT – back to the list
  cut(at("count") - 0.1, "#list", "#meny");
  focus(at("count") - 0.1, { sx: 589, sy: 1500, s: 1.0, ty: 1105 }, 0.01);
  label(at("count"), "#l5", end("count") + 0.2);
  sound(at("count", "60"), "kaching", 0.9);

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.2, p2: at("cta", "gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
