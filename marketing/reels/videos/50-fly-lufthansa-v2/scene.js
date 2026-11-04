// Lufthansa Bergen–Shanghai 9.–18. des.: Lufthansa's "from" price does not say whether it is the round-trip
// total, so the video shows the panel's cheapest round trip without claiming a saving (user's screenshots 4. nov. 2026).
// Boxes are measured on the 1568 px screenshots; assets are 2× Lanczos upscales.
const X2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * 2) : v]));
window.buildScene = R => window.buildDeskFlightReel(R, X2({
  hookToken: '7 887 kr', siteToken: '8 188 kr', bestToken: '7 887 kr', infoToken: 'raden', difference: 7887,
  siteView: [520, 15, 1060, 160], site: [752, 36, 826, 128],
  rows: [46, 366, 420, 688], best: [46, 412, 420, 464],
  tip: [456, 26, 790, 680], tipMark: [516, 218, 772, 288],
}));
