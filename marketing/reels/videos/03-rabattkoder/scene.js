// 03 – Rabattkoder + cashback på Lyko (ekte skjermbilder 6. okt. 2026)
window.buildScene = function (R) {
  const { tl, gs, init, at, end, focus, camReset, ring, tap, popIn, popOut, sound, captions, endcard } = R;

  init("#panel", { y: 1800 });
  init(["#end", "#chip"], { opacity: 0 });
  init(["#search", "#chip"], { xPercent: -50 });
  const [hx, hy] = R.shotToStage(590, 700);
  init("#cam", { x: 540 - hx, y: 1150 - hy, scale: 1.0 });

  // HOOK — sticker + a search pill that gets crossed out
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.fromTo("#search", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0.05);
  tl.to("#search .strike", { scaleX: 1, duration: 0.25, ease: "power2.out" }, at("hook", "rabattkoder"));
  tl.to("#search", { rotate: -3, duration: 0.12, yoyo: true, repeat: 3 }, at("hook", "rabattkoder"));
  sound(at("hook", "rabattkoder"), "pop", 0.7);
  focus(0, { sx: 590, sy: 700, s: 1.06, ty: 1140 }, 2.0, "sine.inOut");

  // POPUP — panel slides up
  popOut(at("popup") - 0.15, "#hook");
  popOut(at("popup") - 0.15, "#search");
  camReset(at("popup") - 0.1, 0.5);
  tl.to("#panel", { y: 0, duration: 0.6, ease: "power3.out" }, at("popup", "automatisk"));
  sound(at("popup", "automatisk") - 0.05, "whoosh", 0.9);
  popIn(at("popup", "automatisk") + 0.35, "#chip");
  popOut(end("popup") + 0.1, "#chip");
  tl.set("#after", { opacity: 1 }, end("popup") + 0.2);

  // CODES
  focus(at("codes") - 0.1, { sx: 580, sy: 2150, s: 1.45, ty: 760 }, 0.6);
  ring(at("codes", "20 %"), [135, 1954, 1020, 2056], { good: true, hold: 1.4 });
  sound(at("codes", "20 %"), "ding", 0.8);

  // COPY — real "Kopiert!" state
  tap(at("copy", "trykk"), 501, 2004);
  sound(at("copy", "trykk"), "click", 0.9);
  tl.set("#copied", { opacity: 1 }, at("copy", "trykk") + 0.12);
  sound(at("copy", "kopiert"), "ding", 0.6);

  // CASHBACK rows
  tl.set("#copied", { opacity: 0 }, at("cash") - 0.1);
  focus(at("cash") - 0.2, { sx: 580, sy: 900, s: 1.4, ty: 760 }, 0.6);
  ring(at("cash", "cashback"), [135, 640, 1020, 1168], { good: true, hold: 1.4 });
  sound(at("cash", "cashback"), "pop", 0.6);

  // SUM — type 1000 and watch percentages become kroner
  focus(at("sum") - 0.15, { sx: 640, sy: 760, s: 1.45, ty: 700 }, 0.5);
  tap(at("sum", "Skriv") + 0.15, 895, 561);
  sound(at("sum", "Skriv") + 0.15, "click", 0.7);
  ["#s1", "#s2", "#s3", "#s4"].forEach((id, i) => {
    const t = at("sum", "beløpet") + i * 0.13;
    tl.set(id, { opacity: 1 }, t);
    sound(t, "click", 0.35);
  });
  ring(at("sum", "nøyaktig"), [135, 748, 1020, 844], { good: true, hold: 0.9 });
  focus(at("sum", "kroner") - 0.25, { sx: 580, sy: 2050, s: 1.45, ty: 760 }, 0.5);
  ring(at("sum", "kroner") + 0.2, [135, 1954, 1020, 2056], { good: true, hold: 1.0 });
  sound(at("sum", "kroner") + 0.2, "kaching", 0.8);

  endcard(at("cta") - 0.2, { free: at("cta", "Gratis"), p1: at("cta", "Chrome"), p2: at("cta", "iPhone"), p3: at("cta", "cashbacknorge.no") });

  captions({ skip: ["cta"] });
};
