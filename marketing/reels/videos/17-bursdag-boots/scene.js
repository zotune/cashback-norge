// 17 – Bursdagsrabatt hos Boots: userscriptet på boots.no, Sum-felt og tooltip (ekte skjermbilder 19. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard, burst } = R;
  init("#panel", { y: 1800 });
  init(["#end", ".flash", "#chip", "#card", "#fine"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const swap = (t, show, hide) => { tl.to(show, { opacity: 1, duration: 0.2 }, t); if (hide) tl.to(hide, { opacity: 0, duration: 0.2 }, t); };

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "30 %"));
  sound(at("hook", "30 %"), "pop", 0.7);
  focus(0, { sx: 590, sy: 900, s: 1.08, ty: 1130 }, 3.0, "sine.inOut");

  // STORE – panel slides up on boots.no
  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("store", "Cashback"));
  sound(at("store", "Cashback") - 0.05, "whoosh", 0.9);
  focus(at("store", "bursdagsrabatten") - 0.2, { sx: 580, sy: 1050, s: 1.5, ty: 800 }, 0.5);
  ring(at("store", "bursdagsrabatten"), [132, 1030, 1018, 1156], { good: true, hold: 1.2 });
  popIn(at("store", "bursdagsrabatten"), "#chip", { from: 0.6 });
  sound(at("store", "bursdagsrabatten"), "ding", 0.8);
  popOut(end("store") + 0.05, "#chip");

  // SUM – 450 kr gives 135 kr
  tap(at("sum") + 0.05, 898, 950);
  swap(at("sum", "450 kr"), "#sum", "#panel");
  sound(at("sum", "450 kr"), "click", 0.7);
  ring(at("sum", "450 kr"), [778, 911, 1019, 988], { good: true, hold: 0.9 });
  ring(at("sum", "135 kr"), [132, 1030, 520, 1156], { good: true, hold: 0.9 });
  const tc = at("sum", "135 kr") + 0.6;
  tl.to(".dim", { opacity: 1, duration: 0.25 }, tc);
  popIn(tc, "#card", { xPercent: 0, from: 0.7 });
  sound(tc + 0.2, "kaching", 0.9);
  burst(tc + 0.2, "🎂", { x: 540, y: 560, n: 8 });
  popOut(end("sum") + 0.2, "#card", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.25 }, end("sum") + 0.2);

  // TERMS – tooltip with requirements, minimum purchase and source status
  tap(at("terms") + 0.05, 628, 1092);
  swap(at("terms") + 0.15, "#tip", "#sum");
  sound(at("terms") + 0.15, "pop", 0.6);
  focus(at("terms") + 0.1, { sx: 640, sy: 1500, s: 1.3, ty: 820 }, 0.5);
  ring(at("terms", "kundeklubb"), [180, 1515, 1150, 1600], { good: true, hold: 1.0 });
  ring(at("terms", "300 kr"), [180, 1620, 1150, 1690], { good: true, hold: 1.0 });
  popIn(at("terms", "kundeklubb"), "#fine", { xPercent: 0, from: 0.95 });
  popOut(end("more") + 0.1, "#fine", { xPercent: 0 });

  // MORE – pull back
  focus(at("more") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.6);
  ring(at("more", "60"), [690, 1052, 1000, 1132], { good: true, hold: 0.9 });
  sound(at("more", "60"), "ding", 0.6);

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.2, p2: at("cta", "gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
