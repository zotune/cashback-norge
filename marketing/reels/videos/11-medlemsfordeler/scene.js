// 11 – Medlemsfordeler/fagforening: overlay på sats.no (ekte skjermbilde 6. okt. 2026) + vegg med alle 36 medlemsorganisasjoner
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, sound, captions, endcard } = R;

  const wall = document.getElementById("wall");
  const els = window.BADGES.map(([label, bg, fg, spoken], i) => {
    const el = document.createElement("div");
    el.className = "b" + (i < 7 ? " lg" : "");
    el.textContent = label;
    el.style.background = bg;
    el.style.color = fg;
    if (bg !== "#fff" && bg !== "#fff7f0") el.style.borderColor = bg;
    wall.appendChild(el);
    return { el, spoken };
  });

  init("#panel", { y: 1800 });
  init(["#end", "#chip", "#wall h3"], { opacity: 0 });
  init("#chip", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "fagforening"));
  sound(at("hook", "fagforening"), "pop", 0.7);
  focus(0, { sx: 590, sy: 900, s: 1.08, ty: 1130 }, 3.2, "sine.inOut");

  // STORE — panel slides up on sats.no
  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 589, sy: 1278, s: 1.0, ty: 1105 }, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("store", "Cashback"));
  sound(at("store", "Cashback") - 0.05, "whoosh", 0.9);
  popIn(at("store", "medlemsprisene"), "#chip");
  popOut(end("store") + 0.1, "#chip");

  // ROWS — 15 % unions, 20 % students
  focus(at("rows") - 0.2, { sx: 580, sy: 1300, s: 1.5, ty: 820 }, 0.55);
  ring(at("rows", "15 %"), [135, 1192, 1020, 1522], { good: true, hold: 2.1 });
  sound(at("rows", "15 %"), "ding", 0.8);
  ring(at("rows", "20 %"), [135, 1078, 1020, 1180], { good: true, hold: 1.3 });
  sound(at("rows", "20 %"), "ding", 0.6);

  // WALL — every membership source, named ones pop on the word
  const tw = at("wall") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.35 }, tw);
  tl.to("#cam", { filter: "blur(6px)", duration: 0.35 }, tw);
  tl.fromTo("#wall h3", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, tw);
  const named = els.filter((x) => x.spoken);
  named.forEach(({ el, spoken }) => {
    const t = at("wall", spoken);
    tl.fromTo(el, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)" }, t);
    sound(t, "pop", 0.4);
  });
  const rest = els.filter((x) => !x.spoken);
  const tr = at("wall", "30+") - 0.1;
  rest.forEach(({ el }, i) => {
    tl.fromTo(el, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(2.5)" }, tr + i * 0.025);
  });
  sound(tr, "whoosh", 0.6);
  sound(tr + 0.4, "kaching", 0.7);
  tl.to("#wall", { opacity: 0, duration: 0.3 }, at("cta") - 0.2);

  endcard(at("cta") - 0.15, { free: at("cta", "gratis"), p1: at("cta", "medlemskapet"), p2: at("cta", "gratis") + 0.2, p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
