// PanFlights Shanghai–Bergen ±7 days with max 1 stop, max 21 h and both bags: PanFlights' own cheapest against
// FINN's cheapest date in the window with the same filters (user's screenshots 2. nov. 2026).
window.buildScene = R => window.buildDeskFlightReel(R, {
  hookToken: '1 455 kr', siteToken: '21', site2Token: '6 624 kr', chipsToken: 'filtrene', bestToken: '5 169 kr',
  infoToken: 'datoene', difference: 1455, showBAt: 'best',
  siteView: [223, 149, 789, 640], site: [226, 167, 784, 394],
  siteView2: [1786, 417, 2738, 774], site2: [2425, 454, 2701, 565],
  rows: [71, 792, 818, 1391], chips: [220, 792, 818, 833],
  bestRows: [83, 807, 833, 1403], bestB: [83, 863, 830, 936],
  tip: [872, 184, 1512, 1612], tipMark: [973, 257, 1501, 340],
});
