// 01 – Prismatch på mobil: Elkjøp 13 490 kr vs 9 190 kr (ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, camReset, ring, popIn, popOut, countUp, burst, sound, captions } = R;

  // Initial state
  init("#panel", { y: 1700 });
  init(["#card", "#end", "#chip"], { opacity: 0 });
  init("#hook", { xPercent: -50 });
  init("#chip", { xPercent: -50 });

  // HOOK — sticker is visible on frame 0 (thumbnail), small bounce, slow push-in
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.18, yoyo: true, repeat: 3, ease: "sine.inOut" }, at("hook", "4 300 kr"));
  const [hx, hy] = R.shotToStage(590, 1500);
  init("#cam", { x: 540 - hx, y: 1260 - hy, scale: 1 });
  focus(0, { sx: 590, sy: 1500, s: 1.08, ty: 1250 }, 3.4, "sine.inOut");
  sound(at("hook", "4 300 kr"), "pop", 0.7);

  // ELKJØP PRICE — zoom to the sticky price bar
  popOut(at("elkjop") - 0.2, "#hook");
  sound(at("elkjop") - 0.1, "whoosh", 0.6);
  focus(at("elkjop") - 0.15, { sx: 470, sy: 2390, s: 1.75, ty: 800 }, 0.7);
  ring(at("elkjop", "13 490 kr"), [28, 2392, 262, 2486], { hold: 1.6 });
  sound(at("elkjop", "13 490 kr"), "click", 0.8);

  // POPUP — Cashback Norge slides up by itself
  camReset(at("popup") - 0.1, 0.6);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("popup") + 0.25);
  sound(at("popup") + 0.2, "whoosh", 0.9);
  popIn(at("popup") + 0.6, "#chip");
  tl.to("#chip", { y: -10, duration: 0.3, yoyo: true, repeat: 3, ease: "sine.inOut" }, at("popup") + 0.95);
  popOut(end("popup") + 0.05, "#chip");

  // MATCH — zoom into the three 9 190 kr rows
  focus(at("match") - 0.05, { sx: 600, sy: 1130, s: 1.55, ty: 760 }, 0.6);
  ring(at("match", "9 190 kr"), [128, 905, 1028, 1356], { good: true, hold: 1.5 });
  sound(at("match", "9 190 kr"), "ding", 0.9);

  // SAVED — comparison card with count-up
  const tSaved = at("saved") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, tSaved);
  popIn(tSaved, "#card", { xPercent: 0, from: 0.7 });
  countUp(tSaved + 0.15, "#saved", 4300, { dur: 0.9 });
  sound(tSaved + 1.05, "kaching", 1);
  burst(tSaved + 1.05, "💸", { x: 540, y: 760, n: 10 });
  popOut(end("saved") + 0.15, "#card", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.3 }, end("saved") + 0.15);

  // EXTRA — cashback section of the same panel
  focus(at("extra") - 0.2, { sx: 580, sy: 1990, s: 1.4, ty: 700 }, 0.6);
  ring(at("extra", "cashback"), [128, 1690, 1028, 2345], { good: true, hold: 1.6 });
  sound(at("extra", "cashback"), "pop", 0.6);

  // CTA — end card
  const tc = at("cta") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.4 }, tc);
  tl.to("#cam", { scale: 0.9, x: 54, y: 260, opacity: 0.35, filter: "blur(10px)", duration: 0.6, ease: "power2.inOut" }, tc);
  tl.to("#end", { opacity: 1, duration: 0.3 }, tc);
  tl.fromTo("#end .logo", { scale: 0.3, rotate: -15 }, { scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.4)" }, tc);
  tl.fromTo("#end .url", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, tc + 0.15);
  tl.fromTo("#free", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, at("cta", "gratis"));
  tl.fromTo("#p1", { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.3, ease: "back.out(2)" }, at("cta", "Chrome"));
  tl.fromTo("#p2", { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: 0.3, ease: "back.out(2)" }, at("cta", "iPhone"));
  tl.fromTo("#p3", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(3)" }, at("cta", "cashbacknorge.no"));
  tl.to("#p3", { scale: 1.07, duration: 0.35, yoyo: true, repeat: 5, ease: "sine.inOut" }, at("cta", "cashbacknorge.no") + 0.4);
  sound(tc, "whoosh", 0.7);
  sound(at("cta", "Chrome"), "pop", 0.5);
  sound(at("cta", "iPhone"), "pop", 0.5);
  sound(at("cta", "cashbacknorge.no"), "ding", 0.7);

  captions({ skip: ["cta"] });
};
