(() => {
  const SCRIPT_URL = "https://cashbacknorge.no/cashback-varsler.user.js";
  const STAY_URL = "https://apps.apple.com/no/app/stay-for-safari/id1591620171";
  // Registered in Stay's CFBundleURLSchemes; opens the installed app.
  const STAY_APP_URL = "stay://";
  const SAFARI_URL = "https://apps.apple.com/no/app/safari/id1146562112";
  const guide = document.getElementById("iphone-guide");
  const back = document.querySelector('.guide-back');
  // Older cached home pages still request this script and have an inline guide button.
  if (!guide || !back) {
    document.getElementById('iphone-guide-btn')?.addEventListener('click', (event) => {
      event.preventDefault();
      location.assign('iphone/' + location.search);
    });
    if (location.hash === '#iphone-guide') location.replace('iphone/' + location.search);
    return;
  }
  back.href = '../' + location.search;
  const logo = '<span class="demo-stay-logo">S</span>';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const copyWithSelection = (text) => {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:.01;font-size:16px;';
    document.body.append(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Older browsers may block the legacy copy command. */ }
    field.remove();
    return copied;
  };
  const selectVisibleScriptLink = () => {
    const link = guide.querySelector('.guide-link code');
    if (!link) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(link);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const tabs = (selected) => `<div class="demo-tabs"><span class="demo-tab ${selected === 'scripts' ? 'selected' : ''}"><b>‹/›</b>Userscripts</span><span class="demo-tab"><b>♧</b>Bookmarks</span><span class="demo-tab ${selected === 'settings' ? 'selected demo-tap' : ''}"><b>⚙</b>Settings</span></div>`;
  const address = '<div class="demo-address"><span class="demo-menu-icon"></span><span>cashbacknorge.no</span><span style="margin-left:auto">↻</span></div>';
  const steps = [
    {
      title: "Installer Stay",
      instruction: `Installer <a href="${STAY_URL}" target="_blank" rel="noopener noreferrer">Stay for Safari</a> fra App Store. <a href="${STAY_APP_URL}">Åpne Stay</a> når appen er installert.`,
      note: 'Følg Stay sin «Enable Stay»-guide, eller bruk stegene her.',
      demo: `<div class="demo-content"><div class="demo-app-store">App Store</div><div class="demo-app">${logo}<div><strong>Stay for Safari</strong><small>Userscripts &amp; Ad blocking</small></div><span class="demo-pill demo-tap" style="margin-left:auto">HENT</span></div><div class="demo-store-line"></div><div class="demo-store-line"></div></div>`,
    },
    {
      title: "Slå på Stay i Safari",
      instruction: `Åpne <a href="${SAFARI_URL}" target="_blank" rel="noopener noreferrer">Safari</a> på en nettside. Trykk på <strong>sidemenyen</strong> ved adressefeltet → <strong>Administrer utvidelser</strong> → slå på <strong>Stay</strong> → <strong>Ferdig</strong>.`,
      note: 'Engelsk: Manage Extensions → Done. Eldre iOS: aA.',
      demo: `<div class="demo-phase phase-one"><div class="demo-content"><div class="demo-store-line"></div><div class="demo-store-line"></div></div><div class="demo-address" style="bottom:-34px"><span class="demo-menu-icon demo-tap"></span><span>cashbacknorge.no</span></div></div><div class="demo-phase phase-two"><div class="demo-sheet"><div class="demo-row demo-tap">♧ &nbsp; Administrer utvidelser</div><div class="demo-row">aA &nbsp; Tekststørrelse</div></div></div><div class="demo-phase phase-three"><div class="demo-sheet"><div class="demo-sheet-title">Administrer utvidelser <span>Ferdig</span></div><div class="demo-search">Søk</div><div class="demo-row">${logo}<strong>Stay</strong><span class="demo-toggle on"></span></div></div></div>`,
    },
    {
      title: "La scriptet oppdatere seg",
      instruction: `<a href="${STAY_APP_URL}">Åpne Stay</a>. Trykk på <strong>Settings</strong> nederst til høyre. Slå på <strong>Silent Userscript Update</strong> under General.`,
      note: 'Da oppdateres Cashback Norge automatisk.',
      dark: true,
      demo: `<div class="demo-settings"><div class="demo-content"><h4>Settings</h4><div class="demo-small" style="margin:18px 0 10px">GENERAL</div><div class="demo-row demo-tap"><span>Silent Userscript Update</span><span class="demo-toggle animated"></span></div></div>${tabs('settings')}</div>`,
    },
    {
      title: "Legg til Cashback Norge",
      instruction: `<a href="${STAY_APP_URL}">Åpne Stay</a>. Trykk <strong>Userscripts</strong> nederst til venstre → <strong>+</strong> øverst til høyre → <strong>Link</strong>. Lim inn lenken under og trykk <strong>Continue</strong>.`,
      extra: `<div class="cbn-row guide-link"><code>${SCRIPT_URL}</code><button id="iphone-guide-copy" class="cbn-button guide-copy" type="button" aria-label="Kopier scriptlenken">Kopier</button></div><p class="guide-note" id="guide-copy-status" role="status"></p>`,
      dark: true,
      demo: `<div class="demo-phase phase-one"><div class="demo-add-header">Userscripts <span class="demo-plus demo-tap">+</span></div><div class="demo-search" style="background:#292929;margin-top:15px">Search</div></div><div class="demo-phase phase-two"><div class="demo-sheet demo-add-sheet"><strong>Add Userscript</strong><div class="demo-row">New Userscript</div><div class="demo-row demo-tap">↗ &nbsp; Link</div></div></div><div class="demo-phase phase-three"><strong>Add with Link</strong><div class="demo-url">${SCRIPT_URL}</div><div class="demo-continue demo-tap">Continue</div></div>${tabs('scripts')}`,
    },
    {
      title: "Gi Stay tilgang til butikkene",
      instruction: `Åpne <a href="${SAFARI_URL}" target="_blank" rel="noopener noreferrer">Safari</a>: sidemenyen → <strong>Stay</strong> → <strong>Tillat alltid…</strong> → <strong>Tillat alltid på alle nettsteder</strong>.`,
      note: 'Engelsk: Always Allow… → Always Allow on Every Website.',
      demo: `<div class="demo-phase phase-one"><div class="demo-sheet"><div class="demo-row demo-tap">${logo}<strong>Stay</strong><span>›</span></div></div></div><div class="demo-phase phase-two"><div class="demo-sheet"><div class="demo-sheet-title">Stay</div><div class="demo-row demo-allow demo-tap">Tillat alltid…</div><div class="demo-row">Tillat én dag</div></div></div><div class="demo-phase phase-three"><div class="demo-sheet"><div class="demo-row demo-allow demo-tap">Tillat alltid på alle nettsteder</div><div class="demo-row">Kun dette nettstedet</div></div></div>`,
    },
    {
      title: "Prøv i en nettbutikk",
      instruction: `Besøk for eksempel <a href="https://www.komplett.no/" target="_blank" rel="noopener noreferrer">Komplett.no</a> i <a href="${SAFARI_URL}" target="_blank" rel="noopener noreferrer">Safari</a>. <strong>Cashback Norge</strong> skal dukke opp nederst til venstre.`,
      note: 'Ser du ingenting? Sjekk Activated i Stay og tillatelsen til alle nettsteder.',
      demo: `<div class="demo-content"><h4>Nettbutikk</h4><div class="demo-store-line"></div><div class="demo-store-line"></div><div class="demo-check">✓</div></div><div class="demo-cashback"><img src="../favicon.png?v=quokka-1" alt=""><span><strong>Cashback Norge</strong>Se fordeler for denne butikken</span></div>${address}`,
    },
  ];
  const mount = () => {
    guide.classList.add('install-guide');
    window.mountInstallGuide({ guide, steps, storageKey: 'cashback-iphone-step' });
    document.getElementById('iphone-guide-copy').addEventListener('click', async function () {
      const status = document.getElementById('guide-copy-status');
      if (isIOS && copyWithSelection(SCRIPT_URL)) {
        this.textContent = 'Kopiert ✓';
        status.textContent = 'Lim lenken inn i Stay → Link.';
        return;
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(SCRIPT_URL);
        this.textContent = 'Kopiert ✓';
        status.textContent = 'Lim lenken inn i Stay → Link.';
      } catch {
        if (copyWithSelection(SCRIPT_URL)) {
          this.textContent = 'Kopiert ✓';
          status.textContent = 'Lim lenken inn i Stay → Link.';
        } else {
          selectVisibleScriptLink();
          status.textContent = 'Lenken er markert. Trykk og hold på den, velg Kopier, og lim den inn i Stay.';
        }
      }
    });
  };
  if (typeof window.mountInstallGuide === 'function') mount();
  else {
    // A cached v3 guide page does not yet include the shared carousel script.
    const script = document.createElement('script');
    script.src = '../guide-carousel.js?v=2';
    script.onload = mount;
    document.head.append(script);
  }
})();
