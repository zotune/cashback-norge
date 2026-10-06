// 10 – Mobilbonus: overlay på talkmore.no (ekte skjermbilder 6. okt. 2026). Talkmore/Trumf-kampanjen har frist 13. okt.
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, burst, sound, captions, endcard } = R;

  init("#panel", { y: 1800 });
  init(["#card", "#end", "#chip", "#deadline"], { opacity: 0 });
  init(["#chip", "#deadline"], { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "1 500 kr"));
  sound(at("hook", "1 500 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 900, s: 1.08, ty: 1130 }, 3.0, "sine.inOut");

  // STORE — panel slides up on talkmore.no
  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("store", "Cashback"));
  sound(at("store", "Cashback") - 0.05, "whoosh", 0.9);
  popIn(at("store", "dukker"), "#chip");
  popOut(end("store") + 0.1, "#chip");

  // TRUMF 1 500 kr
  focus(at("trumf") - 0.2, { sx: 580, sy: 1170, s: 1.5, ty: 820 }, 0.55);
  ring(at("trumf", "1 500 kr"), [135, 1072, 1020, 1168], { good: true, hold: 2.6 });
  sound(at("trumf", "1 500 kr"), "kaching", 0.9);
  burst(at("trumf", "1 500 kr") + 0.1, "💸", { x: 540, y: 760, n: 8, spread: 380 });
  popIn(at("trumf", "13. oktober"), "#deadline");
  tl.to("#deadline", { scale: 1.06, duration: 0.25, yoyo: true, repeat: 3 }, at("trumf", "13. oktober") + 0.35);
  popOut(end("trumf") + 0.15, "#deadline");

  // DREAMS 350 kr
  ring(at("dreams", "350 kr"), [135, 1180, 1020, 1276], { good: true, hold: 1.2 });
  sound(at("dreams", "350 kr"), "ding", 0.7);

  // LIST — summary card
  const t0 = at("list") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, t0);
  popIn(t0, "#card", { xPercent: 0, from: 0.75 });
  const rows = [...document.querySelectorAll("#card .row")];
  const times = [t0 + 0.2, at("list", "PlussMobil"), at("list", "OneCall"), at("list", "Ice")];
  rows.forEach((row, i) => {
    tl.fromTo(row, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.25, ease: "back.out(2)" }, times[i]);
    sound(times[i], "pop", 0.45);
  });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "operatøren"), p2: at("cta", "gratis") + 0.2, p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
