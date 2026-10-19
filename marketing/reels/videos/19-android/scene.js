// 19 – Android: guiden på cashbacknorge.no/android/ + userscriptet på glitter.no (ekte skjermbilder 19. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard } = R;
  init(["#end", ".flash"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };
  const GUIDE = { sx: 590, sy: 900, s: 1.2, ty: 1000 };

  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "Android"));
  sound(at("hook", "Android"), "pop", 0.7);
  focus(0, { sx: 590, sy: 900, s: 1.08, ty: 1130 }, 2.8, "sine.inOut");
  popOut(at("s0") - 0.15, "#hook");

  // Step 1 – Firefox
  focus(at("s0") - 0.1, GUIDE, 0.5);
  label(at("s0"), "#l1", end("s0") + 0.1);
  tap(at("s0", "Firefox") + 0.2, 590, 775);
  ring(at("s0", "Firefox"), [200, 720, 980, 830], { good: true, hold: 0.9 });
  ring(at("s0", "Chrome"), [30, 1455, 1150, 1585], { hold: 1.4 });
  sound(at("s0", "Firefox"), "ding", 0.7);
  // Step 2 – Tampermonkey
  cut(at("s1") - 0.1, "#g1", "#g0");
  label(at("s1"), "#l2", end("s1") + 0.1);
  tap(at("s1", "Tampermonkey") + 0.2, 590, 690);
  ring(at("s1", "Tampermonkey"), [192, 642, 984, 738], { good: true, hold: 0.9 });
  sound(at("s1", "Tampermonkey"), "ding", 0.7);
  // Step 3 – install the script
  cut(at("s2") - 0.1, "#g2", "#g1");
  label(at("s2"), "#l3", end("s2") + 0.1);
  tap(at("s2", "installer") + 0.15, 590, 1020);
  ring(at("s2", "installer"), [200, 972, 972, 1072], { good: true, hold: 0.9 });
  sound(at("s2", "installer"), "ding", 0.7);
  // Step 4 – ready
  cut(at("s4") - 0.1, "#g4", "#g2");
  label(at("s4"), "#l4", end("s4"));
  ring(at("s4", "fordelene"), [188, 720, 980, 860], { good: true, hold: 0.9 });
  sound(at("s4", "fordelene"), "pop", 0.7);
  // Shop – real panel on glitter.no with an Android Firefox user agent
  cut(at("shop") - 0.15, "#shop", "#g4");
  focus(at("shop") - 0.15, { sx: 580, sy: 1095, s: 1.5, ty: 820 }, 0.01);
  label(at("shop"), "#l5", end("shop") + 0.2);
  ring(at("shop", "25 %"), [132, 1030, 1018, 1156], { good: true, hold: 1.0 });
  sound(at("shop", "25 %"), "kaching", 0.8);

  endcard(at("cta") - 0.15, { free: at("cta") + 0.2, p1: at("cta", "Android"), p2: at("cta", "Android") + 0.3, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
