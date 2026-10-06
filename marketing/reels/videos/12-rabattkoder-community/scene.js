// 12 – Rabattkoder fra brukerne: stem opp/ned og del egne koder (ekte UI på lyko.com 6. okt. 2026, stemmer/innsending ble mocket – ingenting lagret)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard } = R;

  init("#end", { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(580, 2150);
  init("#cam", { x: 540 - hx * 1.2, y: 1120 - hy * 1.2, scale: 1.2 });

  const show = (t, id) => tl.set(id, { opacity: 1 }, t);
  const hide = (t, id) => tl.set(id, { opacity: 0 }, t);
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };

  // HOOK — codes list on Lyko, slow push-in
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -2, duration: 0.14, yoyo: true, repeat: 3 }, at("hook", "funket"));
  sound(at("hook", "funket"), "pop", 0.7);
  focus(0, { sx: 580, sy: 2150, s: 1.3, ty: 1080 }, 2.2, "sine.inOut");

  // INTRO — zoom into the code list
  popOut(at("intro") - 0.1, "#hook");
  focus(at("intro"), { sx: 580, sy: 2150, s: 1.5, ty: 780 }, 0.6);
  ring(at("intro", "kodene"), [135, 1954, 1020, 2512], { good: true, hold: 1.0 });

  // UP — thumbs up on ANNIJOR20
  tap(at("up", "Tommel") - 0.05, 954, 2005);
  sound(at("up", "Tommel") - 0.05, "click", 0.8);
  show(at("up", "Tommel") + 0.05, "#c1");
  sound(at("up", "opp"), "ding", 0.8);
  label(at("up", "opp"), "#lup", end("up") + 0.15);
  show(end("up") + 0.2, "#c1b");

  // DOWN — thumbs down on Leyglow20 → moves to "Utgåtte koder"
  tap(at("down", "Tommel") + 0.1, 864, 2347);
  sound(at("down", "Tommel") + 0.1, "click", 0.8);
  show(at("down", "ned"), "#c2");
  sound(at("down", "ned"), "whoosh", 0.5);
  label(at("down", "ned"), "#ldown", end("down") + 0.1);
  show(at("down", "under"), "#c2b");
  ring(at("down", "utgåtte"), [135, 2410, 560, 2490], { hold: 0.9, pad: 8 });

  // ADD — share your own code
  tap(at("add", "Trykk") + 0.05, 990, 1915);
  sound(at("add", "Trykk") + 0.05, "click", 0.8);
  show(at("add", "Trykk") + 0.15, "#c3");
  label(at("add", "pluss"), "#ladd", end("add") + 0.3);
  ["#t1", "#t2", "#t3", "#t4", "#t5"].forEach((id, i) => {
    const t = at("add", "pluss") + 0.3 + i * 0.1;
    show(t, id);
    sound(t, "click", 0.3);
  });
  tap(at("add", "del") - 0.05, 888, 2007);
  show(at("add", "del") + 0.05, "#c5");
  sound(at("add", "del") + 0.05, "kaching", 0.8);
  ring(at("add", "del") + 0.1, [135, 2296, 1020, 2398], { good: true, hold: 1.0 });

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.15, p2: at("cta", "gratis") + 0.35, p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
