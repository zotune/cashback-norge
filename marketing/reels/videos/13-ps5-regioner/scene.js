// 13 – PS5-regionpriser: 007 First Light Deluxe, Norge 899 kr vs USA $79.99 + US-gavekort (ekte skjermbilder 7. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#panel", { y: 1800 });
  init(["#card", "#end"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1350);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "200 kr"));
  sound(at("hook", "200 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1350, s: 1.08, ty: 1130 }, 3.2, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 520, sy: 1700, s: 1.6, ty: 800 }, 0.6);
  ring(at("store", "899 kr"), [110, 1880, 400, 1975], { hold: 1.5 });
  sound(at("store", "899 kr"), "click", 0.8);

  focus(at("popup") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("popup", "Cashback"));
  sound(at("popup", "Cashback") - 0.05, "whoosh", 0.9);
  ring(at("popup", "regioner"), [135, 690, 1020, 2500], { good: true, hold: 1.0 });

  focus(at("usa") - 0.15, { sx: 580, sy: 2250, s: 1.5, ty: 800 }, 0.5);
  ring(at("usa", "765 kr"), [135, 2344, 1020, 2497], { good: true, hold: 1.4 });
  sound(at("usa", "765 kr"), "ding", 0.9);

  const tg = at("gift") - 0.1;
  tl.set("#gg", { opacity: 1 }, tg);
  sound(tg, "whoosh", 0.6);
  focus(tg, { sx: 589, sy: 1350, s: 1.25, ty: 900 }, 0.01);
  popIn(tg + 0.1, "#lgift", { from: 0.6 }); popOut(end("gift") + 0.1, "#lgift");
  ring(at("gift", "7 %"), [270, 1245, 780, 1340], { good: true, hold: 1.2 });
  ring(at("gift", "7 %") + 0.25, [270, 1740, 780, 1835], { good: true, hold: 1.0 });
  sound(at("gift", "7 %"), "ding", 0.7);

  const ts = at("sum") - 0.25;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.7 });
  countUp(ts + 0.15, "#saved", 187, { dur: 0.7 });
  sound(ts + 0.85, "kaching", 1);
  burst(ts + 0.85, "💸", { x: 540, y: 760, n: 10 });
  popIn(at("how"), "#lhow", { from: 0.6 }); 
  tl.to("#card", { y: 120, duration: 0.3 }, at("how"));
  popOut(at("cta") - 0.15, "#lhow");
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Gratis") + 0.2, p2: at("cta", "Gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
