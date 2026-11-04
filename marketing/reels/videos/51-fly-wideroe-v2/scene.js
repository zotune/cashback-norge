// Widerøe Bergen–Oslo 18. nov.: Widerøe's cheapest (1 732,-, one change) next to the panel's direct Norwegian
// rows. Different airline, so no saving against Widerøe is claimed (user's screenshots 4. nov. 2026).
// Boxes are measured on the 1568 px screenshots; assets are 2× Lanczos upscales.
const X2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * 2) : v]));
window.buildScene = R => window.buildDeskFlightReel(R, X2({
  hookToken: '698 kr', siteToken: '1 732 kr', bestToken: '698 kr', infoToken: 'raden', difference: 698,
  siteView: [470, 480, 1200, 590], site: [470, 495, 1184, 577],
  rows: [46, 226, 420, 635], best: [46, 268, 420, 320],
  tip: [456, 14, 790, 574], tipMark: [516, 190, 778, 246],
}));
