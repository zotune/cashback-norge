// 20 – Temafiltre på cashbacknorge.no: Strøm, Mobil, Student (ekte skjermbilder 19. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, tap, popIn, popOut, sound, captions, endcard } = R;
  init(["#end", ".flash", "#fine"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1500);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };

  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "bonusen"));
  sound(at("hook", "bonusen"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1500, s: 1.08, ty: 1130 }, 2.8, "sine.inOut");

  // TAP – the topic row on the front page
  popOut(at("tap") - 0.1, "#hook");
  focus(at("tap") - 0.1, { sx: 540, sy: 1540, s: 1.5, ty: 900 }, 0.5);
  ring(at("tap") + 0.3, [10, 1495, 1080, 1590], { good: true, hold: 1.0 });
  tap(at("tap", "Strøm"), 132, 1540);
  sound(at("tap", "Strøm"), "click", 0.8);
  popIn(at("tap"), "#fine", { xPercent: 0, from: 0.95 });

  // STRØM – Fortum card with four bonuses
  cut(at("strom") - 0.1, "#strom", "#home");
  focus(at("strom") - 0.1, { sx: 560, sy: 1200, s: 1.3, ty: 900 }, 0.01);
  label(at("strom"), "#l1", end("strom") + 0.1);
  ring(at("strom", "fire"), [66, 1005, 1050, 1540], { good: true, hold: 1.3 });
  ring(at("strom", "mest"), [66, 1005, 1050, 1125], { good: true, hold: 0.8 });
  sound(at("strom", "fire"), "ding", 0.8);

  // MOBIL – Ice via Dreams
  cut(at("mobil") - 0.1, "#mobil", "#strom");
  focus(at("mobil") - 0.1, { sx: 560, sy: 1200, s: 1.3, ty: 900 }, 0.01);
  tap(at("mobil") + 0.05, 645, 85);
  label(at("mobil", "Ice"), "#l2", end("mobil") + 0.1);
  ring(at("mobil", "270 kr"), [66, 1020, 1050, 1140], { good: true, hold: 1.0 });
  sound(at("mobil", "270 kr"), "kaching", 0.8);

  // STUDENT – 426 stores
  cut(at("stud") - 0.1, "#student", "#mobil");
  focus(at("stud") - 0.1, { sx: 589, sy: 1300, s: 1.2, ty: 1000 }, 0.01);
  ring(at("stud", "student"), [728, 992, 952, 1100], { good: true, hold: 0.9 });
  label(at("stud", "400"), "#l3", end("stud") + 0.2);
  ring(at("stud", "400"), [870, 1135, 1095, 1190], { good: true, hold: 0.9 });
  sound(at("stud", "400"), "ding", 0.8);
  popOut(end("stud") + 0.1, "#fine", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.2, p2: at("cta", "gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
