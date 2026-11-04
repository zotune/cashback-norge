// SAS Oslo–Bergen 18.–27. nov.: SAS shows one direction (741,-); the panel prices the whole round trip
// (user's screenshots 4. nov. 2026). Boxes are measured on the 1568 px screenshots; assets are 2× upscales.
const X2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * 2) : v]));
window.buildScene = R => window.buildDeskFlightReel(R, X2({
  hookToken: '1 054 kr', siteToken: '741 kr', bestToken: '1 054 kr', infoToken: 'Norwegian', difference: 1054,
  siteView: [1000, 225, 1480, 535], site: [1196, 458, 1304, 526],
  rows: [46, 226, 420, 638], best: [46, 268, 420, 320],
  tip: [456, 58, 790, 530], tipMark: [516, 250, 778, 286],
}));
