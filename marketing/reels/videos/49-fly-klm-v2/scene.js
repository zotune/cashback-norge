// KLM Shanghai–Bergen 25. nov.: KLM's lowest fare (1 stop) against the panel's cheapest 1-stop rows
// (Skyscanner, momondo with bags). The 2-stop rows are shown in the tooltip but not used as savings.
// Boxes are measured on the 1568 px screenshots; assets are 2× Lanczos upscales (user's screenshots 4. nov. 2026).
const X2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * 2) : v]));
window.buildScene = R => window.buildDeskFlightReel(R, X2({
  hookToken: '6 718 kr', siteToken: '8 852 kr', bestToken: '6 718 kr', secondToken: '6 767', infoToken: 'stopp',
  tipMarkToken: 'billigere', difference: 2134,
  siteView: [500, 360, 1060, 465], site: [684, 370, 868, 453],
  rows: [46, 228, 420, 598], best: [46, 452, 420, 502], secondBest: [46, 508, 420, 558],
  tip: [456, 8, 790, 550], tipMark: [504, 184, 778, 236],
}));
