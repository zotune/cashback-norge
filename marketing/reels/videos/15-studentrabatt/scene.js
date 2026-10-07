// 15 – Studentrabatter: Flytoget, Talkmore, Samsung, Lyko (ekte skjermbilder 6.–7. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, sound, captions, endcard } = R;
  init(["#end", ".flash"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 1300);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  const label = (t, sel, until) => { popIn(t, sel, { from: 0.6 }); popOut(until, sel); };

  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "Student"));
  sound(at("hook", "Student"), "pop", 0.7);
  focus(0, { sx: 590, sy: 1300, s: 1.08, ty: 1130 }, 2.6, "sine.inOut");
  popOut(at("intro") - 0.1, "#hook");
  focus(at("intro"), { sx: 589, sy: 1400, s: 1.2, ty: 1000 }, 0.6);

  // Flytoget
  focus(at("fly") - 0.15, { sx: 580, sy: 1480, s: 1.5, ty: 820 }, 0.5);
  label(at("fly"), "#l1", end("fly") + 0.1);
  ring(at("fly", "50 %"), [135, 1455, 1020, 1551], { good: true, hold: 0.8 });
  sound(at("fly", "50 %"), "ding", 0.8);
  // Talkmore
  cut(at("talk") - 0.1, "#talkmore", "#flytoget");
  focus(at("talk") - 0.1, { sx: 580, sy: 690, s: 1.5, ty: 820 }, 0.01);
  label(at("talk"), "#l2", end("talk") + 0.1);
  ring(at("talk", "30 %"), [135, 640, 1020, 736], { good: true, hold: 0.8 });
  sound(at("talk", "30 %"), "ding", 0.8);
  // Samsung
  cut(at("sams") - 0.1, "#samsung", "#talkmore");
  focus(at("sams") - 0.1, { sx: 580, sy: 910, s: 1.5, ty: 820 }, 0.01);
  label(at("sams"), "#l3", end("sams") + 0.1);
  ring(at("sams", "15 %"), [135, 862, 1020, 958], { good: true, hold: 0.8 });
  sound(at("sams", "15 %"), "ding", 0.8);
  // Lyko
  cut(at("lyko") - 0.1, "#lyko", "#samsung");
  focus(at("lyko") - 0.1, { sx: 580, sy: 690, s: 1.5, ty: 820 }, 0.01);
  label(at("lyko"), "#l4", end("lyko") + 0.1);
  ring(at("lyko", "15 %"), [135, 640, 1020, 736], { good: true, hold: 0.8 });
  sound(at("lyko", "15 %"), "ding", 0.8);
  // Count
  focus(at("count") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.6);
  label(at("count"), "#l5", end("count") + 0.2);
  sound(at("count", "500"), "kaching", 0.9);

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "gratis") + 0.2, p2: at("cta", "gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
