// 25 – YouTube Premium: 219 kr i App Store mot 169 kr på nett, pluss SB1 Ung 20 % (ekte skjermbilder 21. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init(["#card", "#end", ".flash", "#fine"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1400);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const swap = (t, show, hide) => { tl.to(show, { opacity: 1, duration: 0.2 }, t); tl.to(hide, { opacity: 0, duration: 0.2 }, t); };

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "600 kr"));
  sound(at("hook", "600 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1400, s: 1.05, ty: 1130 }, 3.0, "sine.inOut");

  // APP – App Store in-app purchase list
  popOut(at("app") - 0.1, "#hook");
  popIn(at("app") - 0.05, "#l1", { from: 0.6 });
  focus(at("app") - 0.1, { sx: 590, sy: 1400, s: 1.45, ty: 1000 }, 0.6);
  ring(at("app", "219 kr"), [70, 1250, 1110, 1312], { hold: 1.4, pad: 8 });
  sound(at("app", "219 kr"), "click", 0.8);
  popOut(end("app") + 0.05, "#l1");

  // WEB – youtube.com/premium
  cut(at("web") - 0.1, "#before", "#appstore");
  popIn(at("web"), "#l2", { from: 0.6 });
  focus(at("web") - 0.1, { sx: 400, sy: 820, s: 1.7, ty: 1000 }, 0.01);
  ring(at("web", "169 kr"), [90, 755, 490, 845], { good: true, hold: 1.4, pad: 8 });
  sound(at("web", "169 kr"), "ding", 0.8);
  popOut(end("web") + 0.05, "#l2");

  // SB1 – panel with SpareBank 1 Ung row
  focus(at("sb1") - 0.1, { sx: 590, sy: 1150, s: 1.3, ty: 1000 }, 0.5);
  swap(at("sb1", "Cashback"), "#after", "#before");
  sound(at("sb1", "Cashback"), "whoosh", 0.8);
  ring(at("sb1", "20 %"), [132, 948, 1017, 1074], { good: true, hold: 1.4, pad: 6 });
  sound(at("sb1", "20 %"), "ding", 0.8);

  // TERMS – tap info
  tap(at("terms", "info-knappen"), 900, 1010);
  swap(at("terms", "info-knappen") + 0.15, "#tip", "#after");
  focus(at("terms", "info-knappen") + 0.1, { sx: 645, sy: 1335, s: 1.45, ty: 1000 }, 0.5);
  ring(at("terms", "vilkårene"), [135, 1083, 1155, 1300], { good: true, hold: 1.0, pad: 6 });
  popIn(at("terms"), "#fine", { xPercent: 0, from: 0.95 });

  // SUM card
  const ts = at("sum") - 0.1;
  popOut(ts, "#fine", { xPercent: 0 });
  tl.to(".dim", { opacity: 1, duration: 0.25 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.75 });
  countUp(ts + 0.1, "#saved", 600, { dur: 0.6 });
  sound(ts + 0.7, "kaching", 0.9);
  burst(ts + 0.7, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Gratis") + 0.2, p2: at("cta", "Gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
