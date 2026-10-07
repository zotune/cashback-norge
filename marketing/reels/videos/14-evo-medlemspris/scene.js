// 14 – EVO Fitness medlemspriser: overlay på evofitness.no (ekte skjermbilder 7. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 1800 });
  init(["#card", "#end", "#chip"], { opacity: 0 });
  init(["#chip", "#ord"], { xPercent: -50 });
  init("#ord", { opacity: 0 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "1 000 kr"));
  sound(at("hook", "1 000 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 900, s: 1.08, ty: 1130 }, 3.2, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 590, sy: 350, s: 1.4, ty: 800 }, 0.6);
  popIn(at("store", "459 kr") - 0.1, "#ord", { from: 0.6 });
  popOut(end("store") + 0.1, "#ord");

  focus(at("popup") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("popup", "Cashback"));
  sound(at("popup", "Cashback") - 0.05, "whoosh", 0.9);
  popIn(at("popup", "medlemsprisene"), "#chip");
  popOut(end("popup") + 0.1, "#chip");

  focus(at("rows") - 0.2, { sx: 580, sy: 1230, s: 1.6, ty: 800 }, 0.55);
  ring(at("rows", "369 kr"), [135, 1231, 1020, 1441], { good: true, hold: 1.8 });
  sound(at("rows", "369 kr"), "ding", 0.8);
  ring(at("rows", "379 kr"), [135, 1123, 1020, 1219], { good: true, hold: 1.2 });
  sound(at("rows", "379 kr"), "ding", 0.6);

  const ts = at("sum") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.75 });
  [...document.querySelectorAll("#card .row")].forEach((row, i) => { tl.fromTo(row, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.25, ease: "back.out(2)" }, ts + 0.1 + i * 0.15); });
  countUp(ts + 0.5, "#saved", 1080, { dur: 0.8 });
  sound(ts + 1.3, "kaching", 1);
  burst(ts + 1.3, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "medlemskapet"), p2: at("cta", "gratis") + 0.2, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
