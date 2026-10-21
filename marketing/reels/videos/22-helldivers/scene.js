// 22 – Helldivers 2: Steam 449 kr mot Keyshop (LDShop) 205,11 kr via GG Deals (ekte skjermbilder 21. okt. 2026)
window.buildScene = function (R) {
  const { tl, init, at, end, focus, ring, popIn, popOut, countUp, burst, sound, captions, endcard } = R;
  init(["#card", "#end", "#fine"], { opacity: 0 });
  const [hx, hy] = R.shotToStage(1280, 800);
  init("#cam", { x: 540 - hx * 1.2, y: 1000 - hy * 1.2, scale: 1.2 });
  const swap = (t, show, hide) => { tl.to(show, { opacity: 1, duration: 0.25 }, t); tl.to(hide, { opacity: 0, duration: 0.25 }, t); };

  // HOOK
  tl.fromTo("#hook", { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 0);
  tl.to("#hook", { rotate: -1.5, duration: 0.16, yoyo: true, repeat: 3 }, at("hook", "244 kr"));
  sound(at("hook", "244 kr"), "pop", 0.7);
  focus(0, { sx: 1280, sy: 800, s: 1.3, ty: 1000 }, 2.6, "sine.inOut");

  // STORE – Steam price
  popOut(at("store") - 0.15, "#hook");
  focus(at("store") - 0.1, { sx: 1054, sy: 608, s: 2.0, ty: 900 }, 0.6);
  ring(at("store", "449 kr"), [1119, 576, 1289, 640], { hold: 1.4, pad: 8 });
  sound(at("store", "449 kr"), "click", 0.8);

  // MATCH – panel with IsThereAnyDeal card
  focus(at("match") - 0.15, { sx: 1000, sy: 900, s: 1.0, ty: 1030 }, 0.5);
  tl.to("#ext", { background: "rgba(31,143,95,.25)", scale: 1.25, duration: 0.2, yoyo: true, repeat: 3 }, at("match", "Cashback"));
  swap(at("match", "Cashback") + 0.1, "#after", "#before");
  sound(at("match", "Cashback") + 0.05, "whoosh", 0.9);
  focus(at("match", "billigste"), { sx: 460, sy: 510, s: 2.1, ty: 880 }, 0.6);
  ring(at("match", "billigste"), [88, 466, 832, 554], { good: true, hold: 2.0, pad: 6 });
  sound(at("match", "205 kr"), "ding", 0.8);

  // TIP – hover tooltip with all shops
  swap(at("tip") - 0.05, "#hover", "#after");
  focus(at("tip") - 0.1, { sx: 1241, sy: 510, s: 1.9, ty: 900 }, 0.5);
  ring(at("tip", "keyshop"), [902, 475, 1605, 609], { good: true, hold: 1.2, pad: 6 });
  popIn(at("tip"), "#fine", { xPercent: 0, from: 0.95 });
  popOut(end("sum") + 0.1, "#fine", { xPercent: 0 });

  // SUM
  const ts = at("sum") - 0.1;
  tl.to(".dim", { opacity: 1, duration: 0.25 }, ts);
  popIn(ts, "#card", { xPercent: 0, from: 0.75 });
  countUp(ts + 0.1, "#saved", 244, { dur: 0.7 });
  sound(ts + 0.8, "kaching", 0.9);
  burst(ts + 0.8, "💸", { x: 540, y: 760, n: 10 });
  popOut(at("cta") - 0.1, "#card", { xPercent: 0 });

  endcard(at("cta") - 0.15, { free: at("cta", "Gratis"), p1: at("cta", "Gratis") + 0.2, p2: at("cta", "Gratis") + 0.4, p3: at("cta", "cashbacknorge.no") });
  captions({ skip: ["cta"] });
};
