// PanFlights Shanghai–Bergen ±7 days with max 1 stop, max 21 h and both bags: PanFlights' own cheapest against
// FINN's cheapest date in the window with the same filters (user's screenshots 4. nov. 2026).
// Boxes are measured on the 1568 px screenshots; assets are 2× Lanczos upscales.
const X2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map(n => n * 2) : v]));
window.buildScene = R => window.buildDeskFlightReel(R, X2({
  hookToken: '651 kr', siteToken: 'stopp', site2Token: '5 808 kr', chipsToken: 'filtrene', bestToken: '5 157 kr',
  infoToken: 'datoene', difference: 651, showBAt: 'best',
  siteView: [100, 0, 440, 128], site: [122, 8, 410, 125],
  siteView2: [450, 380, 1435, 700], site2: [1232, 628, 1432, 692],
  rows: [46, 200, 420, 610], chips: [46, 200, 410, 222],
  best: [46, 228, 420, 280],
  tip: [456, 8, 790, 680], tipMark: [500, 46, 776, 66],
}));
