// 32 – Kron Indeks Global: lavest pris på Finansportalen, 0,15 % i året, kostnadsforskjell over 20 år,
// 14,21 % i året for samme indeks og rentes rente-graf med 14 % og halvparten (ekte skjermbilder 24. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init(["#card", "#end", ".flash", "#fine", "#chartcard"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0 }, { opacity: 0.55, duration: 0.01, immediateRender: false }, t);
    tl.to(".flash", { opacity: 0, duration: 0.25 }, t + 0.01);
    sound(t, "whoosh", 0.45);
  };

  // HOOK – Finansportalen claim on Kron's fund page
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "lavest"));
  sound(at("hook", "lavest"), "pop", 0.7);
  focus(0.2, { sx: 590, sy: 600, s: 1.2, ty: 1000 }, 1.2, "sine.inOut");
  ring(at("hook", "Finansportalen"), [70, 410, 1110, 935], { good: true, hold: 1.2, pad: 8 });

  // FUND – 0,15 % per year
  popOut(at("fund") - 0.1, "#hook");
  cut(at("fund") - 0.1, "#fund", "#cheap");
  focus(at("fund") - 0.1, { sx: 590, sy: 1060, s: 1.3, ty: 880 }, 0.01);
  popIn(at("fund"), "#l1", { from: 0.6 });
  ring(at("fund", "0,15 %"), [330, 980, 560, 1145], { good: true, hold: 1.6, pad: 8 });
  sound(at("fund", "0,15 %"), "ding", 0.8);
  popOut(end("fund") + 0.05, "#l1");

  // HOLDINGS
  cut(at("holdings") - 0.1, "#holdings", "#fund");
  focus(at("holdings") - 0.1, { sx: 640, sy: 690, s: 1.35, ty: 1000 }, 0.01);
  popIn(at("holdings"), "#l2", { from: 0.6 });
  ring(at("holdings", "Nvidia"), [150, 495, 1110, 880], { good: true, hold: 2.0, pad: 8 });
  sound(at("holdings", "Nvidia"), "click", 0.7);
  popOut(end("holdings") + 0.05, "#l2");

  // FEES – what 1,5 % would cost over 20 years
  const tf = at("fees") - 0.1;
  tl.to(".dim", { opacity: 1, duration: 0.25 }, tf);
  popIn(tf, "#card", { xPercent: 0, from: 0.75 });
  countUp(tf + 0.3, "#lost", 172000, { dur: Math.max(0.8, at("fees", "170 000 kr") - tf - 0.3) });
  sound(at("fees", "170 000 kr"), "kaching", 0.8);
  popOut(end("fees") + 0.05, "#card", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.25 }, end("fees") + 0.05);

  // RETURNS – same index, 10 years
  cut(at("returns") - 0.1, "#euronext", "#holdings");
  focus(at("returns") - 0.1, { sx: 600, sy: 1720, s: 1.3, ty: 1000 }, 0.01);
  popIn(at("returns"), "#l3", { from: 0.6 });
  ring(at("returns", "14 %"), [80, 1875, 1120, 2005], { good: true, hold: 1.6, pad: 6 });
  sound(at("returns", "14 %"), "ding", 0.8);
  popIn(at("returns"), "#fine", { xPercent: 0, from: 0.95 });

  // CHART – 14 % per year, then half of it
  const tc = at("chart") - 0.15;
  popOut(tc, "#l3");
  tl.to(".dim", { opacity: 1, duration: 0.25 }, tc);
  popIn(tc, "#chartcard", { xPercent: 0, from: 0.85 });
  const chart = window.growthChart(R, "#chartcard svg", {
    years: 20, max: 1250000, ticks: [[500000, "500k"], [1000000, "1 mill"]],
    lines: [
      { id: "paid", data: Array.from({ length: 20 }, (_v, i) => (i + 1) * 12000), color: "#8a9a92", label: "satt inn", dashed: true },
      { id: "r14", data: [12752, 27289, 43861, 62753, 84291, 108843, 136833, 168741, 205117, 246585, 293859, 347751, 409188, 479226, 559069, 650091, 753855, 872147, 1006999, 1160731], color: "#1f8f5f", label: "14 % i året" },
      { id: "r7", data: [12380, 25627, 39801, 54968, 71196, 88560, 107139, 127019, 148291, 171052, 195406, 221464, 249347, 279182, 311105, 345262, 381811, 420918, 462763, 507536], color: "#d98a00", label: "halvparten: 7 %" },
    ],
  });
  chart.show(at("chart", "1 000 kr"), "paid");
  chart.draw(at("chart", "1 000 kr"), "r14", Math.max(1.2, at("chart", "1,1 million") - at("chart", "1 000 kr")));
  sound(at("chart", "1,1 million"), "kaching", 0.9);
  burst(at("chart", "1,1 million") + 0.1, "💸", { x: 760, y: 420, n: 8 });
  chart.draw(at("half", "halvparten"), "r7", Math.max(1.0, at("half", "500 000") - at("half", "halvparten")));
  sound(at("half", "500 000"), "ding", 0.8);

  // KRON – invitation with 100 kr
  const tk = at("kron") - 0.15;
  popOut(tk, "#chartcard", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.25 }, tk);
  cut(tk, "#invite", "#euronext");
  focus(tk, { sx: 590, sy: 1050, s: 1.3, ty: 1000 }, 0.01);
  popIn(at("kron"), "#l5", { from: 0.6 });
  ring(at("kron", "100 kr"), [350, 1010, 535, 1102], { good: true, hold: 1.6, pad: 8 });
  sound(at("kron", "100 kr"), "kaching", 0.8);
  popOut(at("cta") - 0.2, "#l5");
  popOut(at("cta") - 0.2, "#fine", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta") + 0.05, p1: at("cta") + 0.25, p2: at("cta") + 0.45, p3: at("cta", "bio") });
  captions({ skip: ["cta"] });
};
