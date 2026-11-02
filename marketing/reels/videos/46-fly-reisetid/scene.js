// Oslo–Bali: FINN's cheapest trip (34 h, 3 stops) against the cheapest within a 24-hour limit per leg.
// The unfiltered FINN list (capture a) shows during the hook; the 24-hour list (capture b) from «store».
window.buildScene = (R) => {
  window.buildFlightReel(R, {
    capture: 'b', source: 'finnreise', hookToken: '34 timer', bestToken: '9 360 kr', chipsToken: 'grense', difference: 22,
    hookY: 900, storeY: 800, panelY: 1650,
  });
  R.tl.to('#pageA', { opacity: 0, duration: .3 }, R.at('store', 'tjuefire'));
};
