// 08 – Fly-prismatch: Oslo–Bergen t/r på momondo.no (ekte skjermbilder 7. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 1800 });
  init(["#card", "#end"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(590, 1000);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "284 kr"));
  sound(at("hook", "284 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1000, s: 1.08, ty: 1130 }, 3.0, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 589, sy: 400, s: 1.5, ty: 700 }, 0.6);
  ring(at("store", "Oslo") , [200, 40, 955, 200], { good: true, hold: 1.4 });
  sound(at("store", "Oslo"), "click", 0.7);

  focus(at("match") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("match") + 0.15);
  sound(at("match") + 0.1, "whoosh", 0.9);
  focus(at("match", "FINN") - 0.1, { sx: 580, sy: 1130, s: 1.45, ty: 820 }, 0.6);

  ring(at("rows", "909 kr"), [135, 1279, 1020, 1417], { hold: 1.0 });
  sound(at("rows", "909 kr"), "click", 0.8);
  ring(at("rows", "625 kr"), [135, 829, 1020, 967], { good: true, hold: 1.5 });
  sound(at("rows", "625 kr"), "ding", 0.9);

  const ts = at("sum") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.7 });
  countUp(ts + 0.15, "#saved", 284, { dur: 0.7 });
  sound(ts + 0.85, "kaching", 1);
  burst(ts + 0.85, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "SAS"), p2: at("cta", "Skyscanner"), p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
