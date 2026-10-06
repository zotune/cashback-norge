// 09 – Hotell-prismatch: The Thief på hotell.finn.no (ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, camReset, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 1800 });
  init(["#card", "#end"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(590, 700);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "487 kr"));
  sound(at("hook", "487 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 700, s: 1.08, ty: 1130 }, 3.3, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  sound(at("store") - 0.1, "whoosh", 0.6);
  focus(at("store") - 0.1, { sx: 700, sy: 500, s: 1.6, ty: 800 }, 0.6);
  ring(at("store", "4 113 kr"), [855, 375, 1104, 456], { hold: 1.5 });
  sound(at("store", "4 113 kr"), "click", 0.8);

  focus(at("match") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("match", "Cashback") + 0.2);
  sound(at("match", "Cashback") + 0.15, "whoosh", 0.9);
  focus(at("match", "automatisk") - 0.1, { sx: 580, sy: 1500, s: 1.5, ty: 800 }, 0.6);
  ring(at("match", "3 626 kr"), [135, 1362, 1020, 1500], { good: true, hold: 1.6 });
  sound(at("match", "3 626 kr"), "ding", 0.9);

  const ts = at("sum") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.7 });
  countUp(ts + 0.15, "#saved", 487, { dur: 0.8 });
  sound(ts + 0.95, "kaching", 1);
  burst(ts + 0.95, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "FINN"), p2: at("cta", "Skyscanner"), p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
