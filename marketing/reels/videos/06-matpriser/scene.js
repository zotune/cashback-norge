// 06 – Matpriser: Jarlsberg (joker.no), Evergood og Kvikk Lunsj (spar.no) – ekte skjermbilder 6. okt. 2026
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init("#ap", { y: 1800 });
  init(["#card", "#end", ".flash"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 620);
  init("#cam", { x: 540 - hx * 1.1, y: 1150 - hy * 1.1, scale: 1.1 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0.55 }, { opacity: 0, duration: 0.25, immediateRender: false }, t);
    sound(t, "whoosh", 0.45);
  };
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "69 kr"));
  sound(at("hook", "69 kr"), "pop", 0.7);
  focus(0, { sx: 590, sy: 620, s: 1.18, ty: 1130 }, 3.0, "sine.inOut");

  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 420, sy: 880, s: 1.7, ty: 800 }, 0.6);
  ring(at("store", "159 kr"), [40, 882, 258, 980], { hold: 1.3 });
  sound(at("store", "159 kr"), "click", 0.8);

  tl.to("#ap", { y: 0, duration: 0.55, ease: "power3.out" }, at("match") + 0.1);
  sound(at("match") + 0.05, "whoosh", 0.9);
  focus(at("match") + 0.1, { sx: 580, sy: 1480, s: 1.5, ty: 820 }, 0.6);
  ring(at("match", "90 kr"), [135, 1417, 1020, 1555], { good: true, hold: 1.2 });
  sound(at("match", "90 kr"), "ding", 0.9);

  const tb = at("kaffe") - 0.1;
  cut(tb, ["#b", "#bp"], ["#a", "#ap"]);
  focus(tb, { sx: 560, sy: 1080, s: 1.4, ty: 800 }, 0.01);
  popIn(tb + 0.05, "#lb", { from: 0.6 }); popOut(at("kvikk") - 0.15, "#lb");
  ring(tb + 0.1, [40, 732, 262, 830], { hold: 0.7 });
  ring(at("kaffe", "59 kr"), [135, 1267, 1020, 1405], { good: true, hold: 0.9 });
  sound(at("kaffe", "59 kr"), "ding", 0.7);

  const tk = at("kvikk") - 0.1;
  cut(tk, ["#c", "#cp"], ["#b", "#bp"]);
  focus(tk, { sx: 560, sy: 1400, s: 1.4, ty: 800 }, 0.01);
  popIn(tk + 0.05, "#lc", { from: 0.6 }); popOut(end("kvikk") + 0.05, "#lc");
  ring(tk + 0.1, [40, 1062, 232, 1160], { hold: 0.6 });
  ring(at("kvikk", "24 kr"), [135, 1596, 1020, 1734], { good: true, hold: 0.7 });
  sound(at("kvikk", "24 kr"), "ding", 0.7);

  const ts = at("sum") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.7 });
  countUp(ts + 0.1, "#saved", 152, { dur: 0.7 });
  sound(ts + 0.8, "kaching", 1);
  burst(ts + 0.8, "💸", { x: 540, y: 820, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Meny"), p2: at("cta", "Oda"), p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
