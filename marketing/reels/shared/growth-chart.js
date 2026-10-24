// Animated savings chart for fund reels: each line is drawn year by year while its
// end value counts up. Used by videos 31 and 32.
//
// const chart = growthChart(R, "#chart svg", {
//   years: 20, max: 2600000, ticks: [[1000000, "1 mill"], [2000000, "2 mill"]],
//   lines: [{ id: "r20", data: [...yearly values], color: "#1f8f5f", label: "20 % i året" }],
// });
// chart.draw(t, "r20", 1.6);   chart.show(t, "deposit");
window.growthChart = function (R, sel, { years, max, ticks = [], lines }) {
  const { tl } = R;
  const svg = document.querySelector(sel);
  const NS = "http://www.w3.org/2000/svg";
  const box = { x0: 96, x1: 650, y0: 30, y1: 500 };
  const x = (year) => box.x0 + (box.x1 - box.x0) * (year / years);
  const y = (value) => box.y1 - (box.y1 - box.y0) * (value / max);
  const make = (tag, attrs, text) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    svg.appendChild(el);
    return el;
  };
  const kr = (v) => Math.round(v).toLocaleString("nb-NO").replace(/\s/g, " ") + " kr";

  for (const [value, label] of ticks) {
    make("line", { x1: box.x0, x2: box.x1, y1: y(value), y2: y(value), class: "gc-tick" });
    make("text", { x: box.x0 - 14, y: y(value) + 9, class: "gc-axis", "text-anchor": "end" }, label);
  }
  make("line", { x1: box.x0, x2: box.x1, y1: box.y1, y2: box.y1, class: "gc-base" });
  for (const year of [0, years / 2, years]) {
    make("text", { x: x(year), y: box.y1 + 40, class: "gc-axis", "text-anchor": "middle" }, year === 0 ? "0" : `${year} år`);
  }

  const parts = {};
  for (const line of lines) {
    const points = [[0, 0], ...line.data.map((v, i) => [i + 1, v])];
    const d = points.map(([year, v], i) => `${i ? "L" : "M"}${x(year).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    // pathLength 1 lets a drawn line animate its dash offset from 1 to 0; a dashed line keeps real units.
    const path = make("path", { d, class: "gc-line" + (line.dashed ? " gc-dashed" : ""), stroke: line.color, ...(line.dashed ? {} : { pathLength: 1 }) });
    const last = line.data[line.data.length - 1];
    const ly = y(last);
    const value = make("text", { x: box.x1 + 16, y: ly + 4, class: "gc-value", fill: line.color }, kr(0));
    const label = make("text", { x: box.x1 + 16, y: ly + 40, class: "gc-label" }, line.label);
    const dot = make("circle", { cx: box.x1, cy: ly, r: 11, fill: line.color, class: "gc-dot" });
    R.gs.set([value, label, dot], { opacity: 0 });
    R.gs.set(path, line.dashed ? { opacity: 0 } : { strokeDasharray: 1, strokeDashoffset: 1 });
    parts[line.id] = { path, value, label, dot, last, data: line.data };
  }

  return {
    // Draw a line from year 0 to the end; its value and label ride on the tip and count up.
    draw(t, id, dur = 1.6) {
      const p = parts[id];
      const total = p.path.getTotalLength();
      const state = { progress: 0 };
      const place = () => {
        const tip = p.path.getPointAtLength(state.progress * total);
        const year = Math.max(0, (tip.x - box.x0) / (box.x1 - box.x0) * years);
        const lower = Math.floor(year);
        const at = (i) => (i === 0 ? 0 : p.data[Math.min(i, p.data.length) - 1]);
        const value = at(lower) + (at(lower + 1) - at(lower)) * (year - lower);
        p.value.setAttribute("x", tip.x + 16); p.value.setAttribute("y", tip.y + 4);
        p.label.setAttribute("x", tip.x + 16); p.label.setAttribute("y", tip.y + 40);
        p.value.textContent = kr(state.progress === 1 ? p.last : value);
      };
      tl.to(p.path, { strokeDashoffset: 0, duration: dur, ease: "power1.in" }, t);
      tl.to([p.value, p.label], { opacity: 1, duration: 0.2 }, t);
      tl.to(state, { progress: 1, duration: dur, ease: "power1.in", onUpdate: place }, t);
      tl.fromTo(p.dot, { opacity: 0, scale: 0.3, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, t + dur);
    },
    // Show a line at once, such as the money paid in.
    show(t, id) {
      const p = parts[id];
      p.value.textContent = kr(p.last);
      tl.to([p.path, p.value, p.label, p.dot], { opacity: 1, duration: 0.3 }, t);
    },
  };
};
