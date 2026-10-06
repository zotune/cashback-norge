// 02 – Strømbonus: søk «kraft» på cashbacknorge.no (ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, camReset, ring, tap, popIn, popOut, burst, sound, captions, endcard, K } = R;

  init(["#card", "#end"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(590, 700);
  init("#cam", { x: 540 - hx, y: 1000 - hy, scale: 1.05 });

  // HOOK — empty site, sticker on frame 0
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3, ease: "sine.inOut" }, at("hook", "uten"));
  focus(0, { sx: 590, sy: 760, s: 1.12, ty: 1000 }, 2.6, "sine.inOut");
  sound(at("hook", "uten"), "pop", 0.6);

  // SEARCH — tap the field and type "kraft"
  popOut(at("search") - 0.2, "#hook");
  focus(at("search") - 0.2, { sx: 420, sy: 930, s: 1.55, ty: 760 }, 0.6);
  tap(at("search") + 0.3, 300, 930);
  sound(at("search") + 0.3, "click", 0.7);
  const t0 = at("search", "strømselskapet");
  for (let i = 1; i <= 5; i++) {
    tl.set("#t" + i, { opacity: 1 }, t0 + i * 0.12);
    sound(t0 + i * 0.12, "click", 0.35);
  }
  tl.set("#full", { opacity: 1 }, t0 + 0.9);

  // FJORDKRAFT 500 kr
  focus(at("fjord") - 0.3, { sx: 560, sy: 1380, s: 1.3, ty: 760 }, 0.6);
  ring(at("fjord", "500 kr"), [69, 1455, 1044, 1551], { good: true, hold: 1.7 });
  sound(at("fjord", "500 kr"), "ding", 0.8);

  // KILDEN KRAFT 280 kr — scroll the page
  const scroll = 1350;
  tl.to("#full", { y: -scroll * K, duration: 0.7, ease: "power2.inOut" }, at("kilden") - 0.35);
  sound(at("kilden") - 0.35, "whoosh", 0.4);
  focus(at("kilden") - 0.35, { sx: 560, sy: 1560, s: 1.3, ty: 760 }, 0.7);
  ring(at("kilden", "280 kr"), [69, 2871 - scroll, 1044, 2967 - scroll], { good: true, hold: 1.4 });
  sound(at("kilden", "280 kr"), "ding", 0.8);

  // LIST — summary card, rows pop in
  const tl0 = at("list") - 0.2;
  tl.to(".dim", { opacity: 1, duration: 0.3 }, tl0);
  popIn(tl0, "#card", { xPercent: 0, from: 0.75 });
  const rows = [...document.querySelectorAll("#card .row")];
  const rowTimes = [tl0 + 0.25, at("list", "Fortum"), tl0 + 0.65, at("list", "Tibber")];
  rows.forEach((row, i) => {
    tl.fromTo(row, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.25, ease: "back.out(2)" }, rowTimes[i]);
    sound(rowTimes[i], "pop", 0.45);
  });
  burst(at("list", "bonus"), "⚡", { x: 540, y: 560, n: 8, spread: 380 });

  // CHECK — honest caveat
  popIn(at("check"), "#check", { from: 0.7 });
  tl.to("#fine", { color: "#111614", scale: 1.06, duration: 0.25 }, at("check", "påslag"));
  popOut(end("check") + 0.2, "#check");
  popOut(end("check") + 0.2, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.2, { free: at("cta", "gratis"), p1: at("cta", "strømtilbudene"), p2: at("cta", "gratis") + 0.25, p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta", "check"] });
};
