// Shared helpers for reel compositions. A scene file defines window.buildScene(R)
// and the renderer drives the GSAP timeline frame by frame via window.__seek(t).

(function () {
  const TL = window.TIMELINE;
  const gs = window.gsap;
  const tl = gs.timeline({ paused: true });
  const sfx = [];

  // Screenshots are 1179×2556 (393×852 @3x). The phone screen is 768 px wide.
  // Videos can override with window.FRAME = { x, y, k } (screen origin on stage + shot→stage scale).
  const F = window.FRAME || { x: 540 - 406 + 22, y: 250 + 22, k: 768 / 1179 };
  const K = F.k;
  const PHONE_X = F.x;
  const PHONE_Y = F.y;

  const $ = (sel) => document.querySelector(sel);

  function seg(id) {
    const s = TL.segments.find((x) => x.id === id);
    if (!s) throw new Error("no segment " + id);
    return s;
  }

  function at(id, text) {
    const s = seg(id);
    if (text === undefined) return s.t0;
    const tok = s.tokens.find((t) => t.text.replace(/[.,!?:;]+$/, "") === text);
    if (!tok) throw new Error(`no token "${text}" in ${id}`);
    return tok.t0;
  }

  function end(id) {
    return seg(id).t1;
  }

  // Convert screenshot px → stage px at camera scale 1.
  function shotToStage(sx, sy) {
    return [PHONE_X + sx * K, PHONE_Y + sy * K];
  }

  // Move the camera so screenshot point (sx, sy) sits at stage (tx, ty) with scale s.
  function focus(t, { sx, sy, s = 1, tx = 540, ty = 760 }, dur = 0.6, ease = "power3.inOut") {
    const [px, py] = shotToStage(sx, sy);
    tl.to("#cam", { x: tx - px * s, y: ty - py * s, scale: s, duration: dur, ease }, t);
  }

  function camReset(t, dur = 0.6, ease = "power3.inOut") {
    tl.to("#cam", { x: 0, y: 0, scale: 1, duration: dur, ease }, t);
  }

  // Place a highlight ring around a screenshot rect [x0, y0, x1, y1].
  function ring(t, rect, { good = false, hold = 2, pad = 10 } = {}) {
    const el = document.createElement("div");
    el.className = "ring" + (good ? " good" : "");
    const [x0, y0, x1, y1] = rect;
    Object.assign(el.style, {
      left: x0 * K - pad + "px",
      top: y0 * K - pad + "px",
      width: (x1 - x0) * K + pad * 2 + "px",
      height: (y1 - y0) * K + pad * 2 + "px",
    });
    $(".screen").appendChild(el);
    tl.fromTo(el, { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2.5)" }, t);
    tl.to(el, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, t + 0.25);
    tl.to(el, { opacity: 0, duration: 0.2 }, t + hold);
    return el;
  }

  function tap(t, sx, sy) {
    const el = document.createElement("div");
    el.className = "tap";
    Object.assign(el.style, { left: sx * K + "px", top: sy * K + "px" });
    $(".screen").appendChild(el);
    tl.fromTo(el, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 0.8, duration: 0.18, ease: "power2.out" }, t);
    tl.to(el, { opacity: 0, scale: 1.3, duration: 0.3, ease: "power2.out" }, t + 0.22);
  }

  function popIn(t, sel, { dur = 0.35, from = 0.6, ease = "back.out(2.2)", xPercent = -50 } = {}) {
    tl.fromTo(sel, { opacity: 0, scale: from, xPercent }, { opacity: 1, scale: 1, xPercent, duration: dur, ease }, t);
  }

  function popOut(t, sel, { dur = 0.2, xPercent = -50 } = {}) {
    tl.to(sel, { opacity: 0, scale: 0.85, xPercent, duration: dur, ease: "power2.in" }, t);
  }

  // Karaoke captions built from the TTS word timings.
  function captions({ maxWords = 3, maxChars = 16, skip = [] } = {}) {
    const box = $(".captions");
    const chunks = [];
    for (const s of TL.segments) {
      if (skip.includes(s.id)) continue;
      let cur = [];
      const flush = () => { if (cur.length) chunks.push({ seg: s, toks: cur }); cur = []; };
      const connector = /^(og|i|på|du|en|et|av|til|for|med|som|men|at|å|er|the)$/i;
      for (const tok of s.tokens) {
        if (!tok.text.trim() || tok.text === "–") continue;
        const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + tok.text.length;
        if (cur.length >= maxWords || (cur.length && chars > maxChars)) {
          const carry = cur.length > 1 && connector.test(cur[cur.length - 1].text) ? cur.pop() : null;
          flush();
          if (carry) cur.push(carry);
        }
        cur.push(tok);
        if (/[.,!?:;]$/.test(tok.text)) flush();
      }
      flush();
    }
    chunks.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = "cap-chunk";
      for (const tok of c.toks) {
        const w = document.createElement("span");
        w.className = "cap-word" + (tok.emph ? " emph" : "");
        w.textContent = tok.text.replace(/[.,!?:;]+$/, "");
        el.appendChild(w);
        tok.el = w;
      }
      box.appendChild(el);
      el.style.whiteSpace = "nowrap";
      const maxW = box.clientWidth;
      if (el.scrollWidth > maxW) el.style.fontSize = Math.floor(84 * maxW / el.scrollWidth) + "px";
      const t0 = c.toks[0].t0;
      const next = chunks[i + 1];
      const lastEnd = c.toks[c.toks.length - 1].t1;
      const t1 = next && next.toks[0].t0 - lastEnd < 0.6 ? next.toks[0].t0 : lastEnd + 0.35;
      tl.fromTo(el, { opacity: 0, scale: 0.82, y: 24 }, { opacity: 1, scale: 1, y: 0, duration: 0.12, ease: "back.out(3)" }, t0);
      tl.set(el, { opacity: 0 }, t1);
      for (const tok of c.toks) {
        if (tok.emph) continue;
        tl.set(tok.el, { color: "#ffd84d" }, tok.t0);
        tl.set(tok.el, { color: "#ffffff" }, Math.max(tok.t1, tok.t0 + 0.08));
      }
    });
  }

  // Count a number up inside an element (Norwegian thousands separator).
  function countUp(t, sel, to, { dur = 0.8, prefix = "", suffix = "" } = {}) {
    const obj = { v: 0 };
    const el = $(sel);
    const fmt = (v) => prefix + Math.round(v).toLocaleString("nb-NO").replace(/ /g, " ") + suffix;
    tl.set(el, { textContent: fmt(0) }, 0);
    tl.to(obj, { v: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = fmt(obj.v); } }, t);
  }

  function burst(t, emoji, { x = 540, y = 900, n = 9, spread = 420 } = {}) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "emoji-burst";
      el.textContent = emoji;
      el.style.left = x - 55 + "px";
      el.style.top = y - 55 + "px";
      $("#stage").appendChild(el);
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = spread * (0.7 + ((i * 37) % 10) / 25);
      tl.fromTo(el, { opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 },
        { opacity: 1, x: Math.cos(a) * r, y: Math.sin(a) * r - 120, scale: 1, rotate: (i % 2 ? 1 : -1) * 25, duration: 0.6, ease: "power3.out" }, t);
      tl.to(el, { opacity: 0, y: `+=${140}`, duration: 0.35, ease: "power2.in" }, t + 0.55);
    }
  }

  // End card: blur the phone, show logo/url, then reveal pills at the given times.
  function endcard(tc, { free, p1, p2, p3 }) {
    tl.to(".dim", { opacity: 1, duration: 0.4 }, tc);
    tl.to("#cam", { scale: 0.9, x: 54, y: 260, opacity: 0.35, filter: "blur(10px)", duration: 0.6, ease: "power2.inOut" }, tc);
    tl.to("#end", { opacity: 1, duration: 0.3 }, tc);
    tl.fromTo("#end .logo", { scale: 0.3, rotate: -15 }, { scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.4)" }, tc);
    tl.fromTo("#end .url", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, tc + 0.15);
    tl.fromTo("#free", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, free);
    tl.fromTo("#p1", { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.3, ease: "back.out(2)" }, p1);
    tl.fromTo("#p2", { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: 0.3, ease: "back.out(2)" }, p2);
    tl.fromTo("#p3", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(3)" }, p3);
    tl.to("#p3", { scale: 1.07, duration: 0.35, yoyo: true, repeat: 5, ease: "sine.inOut" }, p3 + 0.4);
    sound(tc, "whoosh", 0.7);
    sound(p1, "pop", 0.5);
    sound(p2, "pop", 0.5);
    sound(p3, "ding", 0.7);
  }

  // Set initial state immediately (not as a timeline event at t=0).
  function init(sel, vars) {
    gs.set(sel, vars);
  }

  function sound(t, name, gain = 1) {
    sfx.push({ t, name, gain });
  }

  const R = { tl, gs, TL, init, endcard, seg, at, end, focus, camReset, ring, tap, popIn, popOut, captions, countUp, burst, sound, shotToStage, K, $ };

  window.__init = async function () {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    gs.set(".sticker, .chip", { xPercent: -50 });
    window.buildScene(R);
    tl.seek(0);
    return { duration: TL.duration, sfx };
  };

  window.__seek = function (t) {
    tl.seek(t, false);
  };
})();
