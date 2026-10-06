// 04 – Slik får du Cashback Norge på iPhone (montasje av ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, camReset, ring, tap, popIn, popOut, sound, captions, endcard } = R;

  init("#end", { opacity: 0 });
  init(".label", { xPercent: -50 });
  init(".flash", { opacity: 0 });
  const [hx, hy] = R.shotToStage(600, 1150);
  init("#cam", { x: 540 - hx * 1.15, y: 1080 - hy * 1.15, scale: 1.15 });

  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t);
    if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => {
    popIn(t, sel, { from: 0.6 });
    popOut(until, sel);
  };

  // HOOK — popup already open on Elkjøp
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "iPhonen"));
  focus(0, { sx: 600, sy: 1150, s: 1.25, ty: 1060 }, 2.2, "sine.inOut");
  sound(at("hook", "iPhonen"), "pop", 0.6);

  // MONTAGE — price / codes / cashback
  popOut(at("montage") - 0.1, "#hook");
  focus(at("montage", "billigere") - 0.35, { sx: 600, sy: 1130, s: 1.5, ty: 860 }, 0.45);
  label(at("montage", "billigere") - 0.1, "#l1", at("montage", "rabattkoder") - 0.12);
  const holdUntil = (t0, cutAt) => Math.max(0.3, cutAt - t0 - 0.28);
  ring(at("montage", "billigere"), [128, 905, 1028, 1356], { good: true, hold: holdUntil(at("montage", "billigere"), at("montage", "rabattkoder") - 0.1) });
  sound(at("montage", "billigere"), "ding", 0.6);

  cut(at("montage", "rabattkoder") - 0.1, "#lyko");
  focus(at("montage", "rabattkoder") - 0.1, { sx: 580, sy: 2150, s: 1.45, ty: 860 }, 0.01);
  label(at("montage", "rabattkoder"), "#l2", at("montage", "cashback") - 0.12);
  ring(at("montage", "rabattkoder") + 0.1, [135, 1954, 1020, 2512], { good: true, hold: holdUntil(at("montage", "rabattkoder") + 0.1, at("montage", "cashback") - 0.1) });

  cut(at("montage", "cashback") - 0.1, "#lykosum", "#lyko");
  focus(at("montage", "cashback") - 0.1, { sx: 580, sy: 900, s: 1.45, ty: 860 }, 0.01);
  label(at("montage", "cashback"), "#l3", end("montage") + 0.15);
  ring(at("montage", "cashback") + 0.1, [135, 640, 1020, 1168], { good: true, hold: holdUntil(at("montage", "cashback") + 0.1, at("count") - 0.15) });

  // COUNT — 1731 butikker on the site
  cut(at("count") - 0.15, "#site0", "#lykosum");
  focus(at("count") - 0.15, { sx: 640, sy: 820, s: 1.5, ty: 860 }, 0.01);
  label(at("count"), "#l4", end("count") + 0.2);
  ring(at("count", "1700"), [850, 790, 1100, 845], { good: true, hold: holdUntil(at("count", "1700"), at("setup") - 0.1), pad: 14 });
  sound(at("count", "1700"), "ding", 0.6);

  // SETUP — tap iPhone/iPad, steps expand
  focus(at("setup") - 0.1, { sx: 560, sy: 900, s: 1.35, ty: 760 }, 0.5);
  tap(at("setup", "iPhone") - 0.05, 548, 813);
  sound(at("setup", "iPhone") - 0.05, "click", 0.8);
  tl.set("#site1", { opacity: 1 }, at("setup", "iPhone") + 0.1);
  focus(at("steps") - 0.2, { sx: 560, sy: 1440, s: 1.25, ty: 800 }, 0.6);
  ring(at("steps", "stegene"), [20, 1050, 1095, 1850], { good: true, hold: 1.6 });
  label(at("steps", "et"), "#l5", end("steps") + 0.25);

  endcard(at("cta") - 0.2, { free: at("cta", "gratis"), p1: at("cta", "uten"), p2: at("cta", "innlogging"), p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
