// 05 – Chrome-utvidelsen på PC/Mac: Lyko 335 kr vs 297 kr (ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, camReset, ring, tap, popIn, popOut, sound, captions, endcard, K } = R;

  init("#panel", { y: 700 });
  init(["#card", "#end"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(1280, 700);
  init("#cam", { x: 540 - hx * 1.2, y: 1000 - hy * 1.2, scale: 1.2 });

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "PC"));
  sound(at("hook", "PC"), "pop", 0.6);
  focus(0, { sx: 1280, sy: 700, s: 1.3, ty: 1000 }, 2.6, "sine.inOut");

  // PRICE on Lyko
  popOut(at("price") - 0.15, "#hook");
  focus(at("price") - 0.2, { sx: 1500, sy: 520, s: 2.0, ty: 820 }, 0.6);
  ring(at("price", "335 kr"), [1320, 545, 1545, 655], { hold: 1.4, pad: 6 });
  sound(at("price", "335 kr"), "click", 0.8);

  // POPUP slides up, extension icon pulses
  focus(at("popup") - 0.15, { sx: 1000, sy: 800, s: 1.0, ty: 1030 }, 0.5);
  tl.to("#ext", { background: "rgba(31,143,95,.25)", scale: 1.25, duration: 0.2, yoyo: true, repeat: 3 }, at("popup", "Chrome-utvidelsen"));
  tl.to("#panel", { y: 0, duration: 0.55, ease: "power3.out" }, at("popup", "Chrome-utvidelsen") + 0.1);
  sound(at("popup", "Chrome-utvidelsen") + 0.05, "whoosh", 0.9);
  focus(at("popup", "viser") + 0.15, { sx: 470, sy: 860, s: 2.2, ty: 860 }, 0.6);
  ring(at("popup", "297 kr"), [88, 812, 836, 910], { good: true, hold: 1.3, pad: 6 });
  sound(at("popup", "297 kr"), "ding", 0.8);

  // comparison card
  const tc = end("popup") - 0.05;
  tl.to(".dim", { opacity: 1, duration: 0.25 }, tc);
  popIn(tc, "#card", { xPercent: 0, from: 0.75 });
  sound(tc + 0.1, "kaching", 0.8);
  popOut(at("extra") + 0.2, "#card", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.25 }, at("extra") + 0.2);

  // EXTRA — cashback rows
  focus(at("extra") + 0.15, { sx: 470, sy: 580, s: 2.2, ty: 860 }, 0.5);
  ring(at("extra", "cashback"), [88, 400, 836, 752], { good: true, hold: 1.5, pad: 6 });

  // SETUP — switch to cashbacknorge.no and click "Chrome-extension"
  focus(at("setup") - 0.25, { sx: 1280, sy: 800, s: 1.0, ty: 1030 }, 0.45);
  tl.set("#site", { opacity: 1 }, at("setup") - 0.05);
  tl.set("#u1", { opacity: 0 }, at("setup") - 0.05);
  tl.set("#u2", { opacity: 1 }, at("setup") - 0.05);
  sound(at("setup") - 0.05, "whoosh", 0.5);
  focus(at("setup", "gratis"), { sx: 1320, sy: 404, s: 2.4, ty: 860 }, 0.55);
  ring(at("setup", "Cashback"), [1200, 378, 1446, 432], { good: true, hold: 1.4, pad: 8 });
  tap(at("setup", "Norge") + 0.2, 1322, 404);
  sound(at("setup", "Norge") + 0.2, "click", 0.8);

  tl.to("#cam", { opacity: 0.06, duration: 0.5 }, at("cta") - 0.1);
  endcard(at("cta") - 0.15, { free: at("cta") + 0.2, p1: at("cta", "Chrome-extension") - 0.3, p2: at("cta", "trykk"), p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
