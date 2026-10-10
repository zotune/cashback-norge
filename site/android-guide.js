(() => {
  const guide = document.getElementById('android-guide');
  if (!guide) return;
  const FIREFOX_URL = 'https://play.google.com/store/apps/details?id=org.mozilla.firefox';
  const TAMPERMONKEY_URL = 'https://addons.mozilla.org/android/addon/tampermonkey/';
  const SCRIPT_URL = 'https://cashbacknorge.no/cashback-varsler.user.js';
  const external = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  const firefox = '<span class="demo-firefox-logo">◉</span>';
  const monkey = '<span class="demo-monkey-logo"><i></i><i></i></span>';
  const address = '<div class="demo-address demo-firefox-address"><span>🔒</span><span>cashbacknorge.no</span><span class="demo-tap" style="margin-left:auto">⋮</span></div>';
  const guideUrl = new URL('https://cashbacknorge.no/android/');
  // Preserve only our search/filter context; never interpolate arbitrary query text into HTML.
  for (const key of ['q', 'provider']) {
    const value = new URLSearchParams(location.search).get(key);
    if (value) guideUrl.searchParams.set(key, value);
  }
  const openFirefox = `intent://${guideUrl.host}${guideUrl.pathname}${guideUrl.search}#Intent;scheme=https;package=org.mozilla.firefox;S.browser_fallback_url=${encodeURIComponent(FIREFOX_URL)};end`;
  const steps = [
    {
      title: 'Installer Firefox',
      instruction: `Installer ${external(FIREFOX_URL, 'Firefox')} fra Google Play. <a href="${openFirefox}">Åpne denne guiden i Firefox</a> for resten av stegene.`,
      note: 'Varslene vises når du handler i Firefox. Chrome på Android støtter ikke utvidelser.',
      phoneClass: 'demo-android',
      demo: `<div class="demo-content"><div class="demo-app-store">Google Play</div><div class="demo-app">${firefox}<div><strong>Firefox</strong><small>Mozilla</small></div></div><div class="demo-android-button demo-tap">Installer</div><div class="demo-store-line"></div><div class="demo-store-line"></div></div>`,
    },
    {
      title: 'Legg til Tampermonkey',
      instruction: `Åpne ${external(TAMPERMONKEY_URL, 'Tampermonkey')} i <strong>Firefox</strong>. Trykk <strong>Legg til i Firefox</strong>, godkjenn med <strong>Legg til</strong> og avslutt med <strong>OK</strong>.`,
      note: 'Engelsk: Add to Firefox → Add → OK. Tampermonkey lar Firefox kjøre Cashback Norge-scriptet.',
      phoneClass: 'demo-android',
      demo: `<div class="demo-phase phase-one"><div class="demo-app">${monkey}<div><strong>Tampermonkey</strong><small>Firefox-utvidelse</small></div></div><div class="demo-android-button demo-tap">Legg til i Firefox</div></div><div class="demo-phase phase-two"><div class="demo-android-dialog"><strong>Legg til Tampermonkey?</strong><p>Tilgang til nettsidene du besøker</p><div class="demo-android-button demo-tap">Legg til</div></div></div><div class="demo-phase phase-three"><div class="demo-android-dialog">${monkey}<strong>Tampermonkey er lagt til</strong><div class="demo-android-button demo-tap">OK</div></div></div>`,
    },
    {
      title: 'Installer Cashback Norge',
      instruction: `Åpne ${external(SCRIPT_URL, 'Cashback Norge-scriptet')} i <strong>Firefox</strong>. Tampermonkey viser en installasjonsside. Trykk <strong>Installer / Install</strong>.`,
      note: 'Du trenger bare å installere scriptet én gang.',
      phoneClass: 'demo-android',
      demo: `<div class="demo-content"><div class="demo-app-store">Tampermonkey</div><h4>cashbacknorge.no</h4><p class="demo-description">Vis cashback-tilbud automatisk på norske nettbutikker</p><div class="demo-script-source">cashbacknorge.no<br>cashback-varsler.user.js</div><div class="demo-android-button demo-tap">Installer</div></div>`,
    },
    {
      title: 'Automatiske oppdateringer',
      instruction: '<strong>Tampermonkey oppdaterer scriptet automatisk som standard.</strong> Du trenger ikke installere det på nytt når vi lager en ny versjon.',
      note: 'Har du endret innstillingene? Firefox-menyen → Utvidelser → Tampermonkey → Dashboard → Settings → Script Update. Velg Check Interval: Every Day og slå på Automatic installation.',
      phoneClass: 'demo-android',
      demo: `<div class="demo-content"><div class="demo-app-store">Tampermonkey · Settings</div><h4>Script Update</h4><div class="demo-row demo-update-row"><span>Check Interval</span><strong>Every Day ▾</strong></div><div class="demo-row demo-update-row"><span>Automatic installation</span><span class="demo-toggle on"></span></div><div class="demo-auto-check"><span>✓</span> Nye versjoner installeres automatisk</div></div>`,
    },
    {
      title: 'Prøv i en nettbutikk',
      instruction: `Besøk for eksempel ${external('https://www.komplett.no/', 'Komplett.no')} i <strong>Firefox</strong>. <strong>Cashback Norge</strong> skal dukke opp nederst til venstre.`,
      note: `Vil du åpne butikklenker i Firefox automatisk? Du kan ${external('https://support.mozilla.org/en-US/kb/make-firefox-default-browser-android', 'sette Firefox som standardnettleser')}.`,
      phoneClass: 'demo-android',
      demo: `<div class="demo-content"><h4>Nettbutikk</h4><div class="demo-store-line"></div><div class="demo-store-line"></div><div class="demo-check">✓</div></div><div class="demo-cashback"><img src="../favicon.png?v=quokka-1" alt=""><span><strong>Cashback Norge</strong>Se fordeler for denne butikken</span></div>${address}`,
    },
  ];
  window.mountInstallGuide({ guide, steps, storageKey: 'cashback-android-step' });
})();
