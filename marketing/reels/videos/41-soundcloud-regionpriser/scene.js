// 41-soundcloud-regionpriser – App Store-regionpriser i Cashback Norge-panelet (ekte skjermbilder 31. okt. 2026, se assets/capture.json)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 1800 });
  init(["#card", "#end", "#fine"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1350);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "99 kr"));
  sound(at("hook", "99 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1350, s: 1.05, ty: 1130 }, 3.0, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  popIn(at("store"), "#lstore", { from: 0.6 });
  sound(at("store", "99 kr"), "click", 0.8);
  popOut(end("store") + 0.05, "#lstore");

  focus(at("popup") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("popup", "Cashback"));
  sound(at("popup", "Cashback") - 0.05, "whoosh", 0.9);
  ring(at("popup", "land"), [135, 505, 1020, 2500], { good: true, hold: 1.0 });

  focus(at("best") - 0.15, { sx: 620, sy: 760, s: 1.5, ty: 800 }, 0.5);
  ring(at("best", "3 kr"), [240, 685, 1017, 835], { good: true, hold: 1.4 });
  sound(at("best", "3 kr"), "ding", 0.9);

  focus(at("second") - 0.15, { sx: 620, sy: 2056, s: 1.5, ty: 900 }, 0.5);
  ring(at("second", "39 kr"), [240, 1981, 1017, 2131], { good: true, hold: 1.4 });
  sound(at("second", "39 kr"), "ding", 0.9);

  const ts = at("sum") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.7 });
  countUp(ts + 0.15, "#saved", 96, { dur: 0.7 });
  sound(ts + 0.85, "kaching", 1);
  burst(ts + 0.85, "💸", { x: 540, y: 760, n: 10 });
  popIn(at("terms"), "#fine", { xPercent: 0, from: 0.95 });
  popOut(at("cta") - 0.15, "#fine", { xPercent: 0 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Gratis") + 0.2, p2: at("cta", "Gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
