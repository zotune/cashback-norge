// 07 – Spill: Final Fantasy VII Rebirth på Epic (549 kr) vs Steam (164,70 kr) – ekte skjermbilder 6. okt. 2026
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 500 });
  init(["#card", "#end"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(1280, 800);
  init("#cam", { x: 540 - hx * 1.2, y: 1000 - hy * 1.2, scale: 1.2 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "380 kr"));
  sound(at("hook", "380 kr"), "pop", 0.7);
  focus(0, { sx: 1280, sy: 800, s: 1.3, ty: 1000 }, 2.6, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 1800, sy: 1380, s: 2.0, ty: 820 }, 0.6);
  ring(at("store", "549 kr"), [1585, 1415, 1760, 1480], { hold: 1.4, pad: 6 });
  sound(at("store", "549 kr"), "click", 0.8);

  focus(at("match") - 0.15, { sx: 1000, sy: 900, s: 1.0, ty: 1030 }, 0.5);
  tl.to("#ext", { background: "rgba(31,143,95,.25)", scale: 1.25, duration: 0.2, yoyo: true, repeat: 3 }, at("match", "Cashback"));
  tl.to("#panel", { y: 0, duration: 0.55, ease: "power3.out" }, at("match", "Cashback") + 0.1);
  sound(at("match", "Cashback") + 0.05, "whoosh", 0.9);
  focus(at("match", "viser") + 0.1, { sx: 460, sy: 850, s: 2.2, ty: 860 }, 0.6);
  ring(at("match", "160 kr"), [88, 802, 836, 898], { good: true, hold: 1.4, pad: 6 });
  sound(at("match", "160 kr"), "ding", 0.8);

  const ts = at("sum") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.25 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.75 });
  countUp(ts + 0.1, "#saved", 384, { dur: 0.7 });
  sound(ts + 0.8, "kaching", 0.9);
  burst(ts + 0.8, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  tl.to("#cam", { opacity: 0.06, duration: 0.5 }, at("cta") - 0.1);
  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Steam"), p2: at("cta", "Epic"), p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
