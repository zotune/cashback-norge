// 31 – DNB Teknologi i Kron: populært fond, 2,15× på 3 år og 2,83× på 5 år (Euronext), rentes rente-graf
// med 20 % og halvparten, aksjesparekonto og Kron-bonus (ekte skjermbilder 24. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, burst, sound, captions, endcard } = R;
  init(["#end", ".flash", "#fine", "#chartcard"], { opacity: 0 });
  init(".label", { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 900);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });
  const cut = (t, show, hide) => {
    tl.set(show, { opacity: 1 }, t); if (hide) tl.set(hide, { opacity: 0 }, t);
    tl.fromTo(".flash", { opacity: 0 }, { opacity: 0.55, duration: 0.01, immediateRender: false }, t);
    tl.to(".flash", { opacity: 0, duration: 0.25 }, t + 0.01);
    sound(t, "whoosh", 0.45);
  };

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "millionær"));
  sound(at("hook", "millionær"), "pop", 0.7);
  burst(at("hook", "millionær") + 0.1, "💰", { x: 540, y: 520, n: 8 });

  // FUND – Kron fund page, then the largest holdings
  popOut(at("fund") - 0.1, "#hook");
  popIn(at("fund"), "#l1", { from: 0.6 });
  focus(at("fund") - 0.1, { sx: 590, sy: 760, s: 1.25, ty: 980 }, 0.6);
  ring(at("fund") + 0.2, [70, 600, 1110, 780], { good: true, hold: 1.6, pad: 8 });
  popOut(at("fund", "Microsoft") - 0.15, "#l1");
  cut(at("fund", "Microsoft") - 0.1, "#holdings", "#fund");
  focus(at("fund", "Microsoft") - 0.1, { sx: 640, sy: 690, s: 1.35, ty: 1000 }, 0.01);
  popIn(at("fund", "Google"), "#l2", { from: 0.6 });
  ring(at("fund", "Microsoft"), [150, 495, 1110, 880], { good: true, hold: 2.4, pad: 8 });
  sound(at("fund", "Microsoft"), "click", 0.7);
  popOut(end("fund") + 0.05, "#l2");

  // RETURNS – Euronext table, 3 and 5 years
  cut(at("returns") - 0.1, "#euronext", "#holdings");
  focus(at("returns") - 0.1, { sx: 600, sy: 1620, s: 1.35, ty: 1000 }, 0.01);
  popIn(at("returns"), "#l3", { from: 0.6 });
  ring(at("returns", "doblet"), [80, 1440, 1120, 1568], { good: true, hold: 1.3, pad: 6 });
  sound(at("returns", "doblet"), "ding", 0.8);
  ring(at("returns", "tredoblet"), [80, 1657, 1120, 1785], { good: true, hold: 1.2, pad: 6 });
  sound(at("returns", "tredoblet"), "ding", 0.8);
  popIn(at("returns"), "#fine", { xPercent: 0, from: 0.95 });

  // CHART – 20 % per year, then half of it
  const tc = at("chart") - 0.15;
  popOut(tc, "#l3");
  tl.to(".dim", { opacity: 1, duration: 0.25 }, tc);
  popIn(tc, "#chartcard", { xPercent: 0, from: 0.85 });
  const chart = window.growthChart(R, "#chartcard svg", {
    years: 20, max: 2600000, ticks: [[1000000, "1 mill"], [2000000, "2 mill"]],
    lines: [
      { id: "paid", data: Array.from({ length: 20 }, (_v, i) => (i + 1) * 12000), color: "#8a9a92", label: "satt inn", dashed: true },
      { id: "r20", data: [13064, 28740, 47552, 70127, 97216, 129723, 168731, 215541, 271713, 339119, 420007, 517072, 633550, 773324, 941053, 1142327, 1383857, 1673692, 2021494, 2438856], color: "#1f8f5f", label: "20 % i året" },
      { id: "r10", data: [12541, 26335, 41509, 58201, 76561, 96758, 118974, 143412, 170294, 199864, 232391, 268170, 307528, 350821, 398444, 450829, 508452, 571838, 641562, 718259], color: "#d98a00", label: "halvparten: 10 %" },
    ],
  });
  chart.show(at("chart", "1 000 kr"), "paid");
  chart.draw(at("chart", "1 000 kr"), "r20", Math.max(1.2, at("chart", "2,4 millioner") - at("chart", "1 000 kr")));
  sound(at("chart", "2,4 millioner"), "kaching", 0.9);
  burst(at("chart", "2,4 millioner") + 0.1, "💸", { x: 760, y: 420, n: 8 });
  chart.draw(at("half", "halvparten"), "r10", Math.max(1.0, at("half", "700 000") - at("half", "halvparten")));
  sound(at("half", "700 000"), "ding", 0.8);

  // ASK – withdraw what you paid in, tax free
  const ta = at("ask") - 0.15;
  popOut(ta, "#chartcard", { xPercent: 0 });
  tl.to(".dim", { opacity: 0, duration: 0.25 }, ta);
  cut(ta, "#ask", "#euronext");
  focus(ta, { sx: 600, sy: 900, s: 1.35, ty: 1000 }, 0.01);
  popIn(at("ask"), "#l4", { from: 0.6 });
  ring(at("ask", "uten"), [110, 790, 1110, 915], { good: true, hold: 1.6, pad: 8 });
  sound(at("ask", "uten"), "click", 0.7);
  popOut(end("ask") + 0.05, "#l4");

  // KRON – invitation with 100 kr
  cut(at("kron") - 0.1, "#invite", "#ask");
  focus(at("kron") - 0.1, { sx: 590, sy: 1050, s: 1.3, ty: 1000 }, 0.01);
  popIn(at("kron"), "#l5", { from: 0.6 });
  ring(at("kron", "100 kr"), [350, 1010, 535, 1102], { good: true, hold: 1.6, pad: 8 });
  sound(at("kron", "100 kr"), "kaching", 0.8);
  popOut(at("cta") - 0.2, "#l5");
  popOut(at("cta") - 0.2, "#fine", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta") + 0.05, p1: at("cta") + 0.25, p2: at("cta") + 0.45, p3: at("cta", "bio") });
  captions({ skip: ["cta"] });
};
