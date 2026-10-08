(() => {
  const SCRIPT_URL = "https://cashbacknorge.no/cashback-varsler.user.js";
  const STAY_URL = "https://apps.apple.com/no/app/stay-for-safari/id1591620171";
  const guide = document.getElementById("iphone-guide");
  const toggle = document.getElementById("iphone-guide-btn");
  const arrow = document.getElementById("iphone-guide-arrow");
  const status = '<div class="demo-status"><span>9:41</span><span>▰ ▰ ●</span></div>';
  const logo = '<span class="demo-stay-logo">S</span>';
  const tabs = (selected) => `<div class="demo-tabs"><span class="demo-tab ${selected === 'scripts' ? 'selected' : ''}"><b>‹/›</b>Userscripts</span><span class="demo-tab"><b>♧</b>Bookmarks</span><span class="demo-tab ${selected === 'settings' ? 'selected demo-tap' : ''}"><b>⚙</b>Settings</span></div>`;
  const address = '<div class="demo-address"><span class="demo-menu-icon"></span><span>cashbacknorge.no</span><span style="margin-left:auto">↻</span></div>';
  const steps = [
    {
      title: "Installer Stay",
      instruction: `Installer <strong>Stay for Safari</strong> fra App Store og åpne appen. Stay lar Cashback Norge kjøre i Safari.`,
      extra: `<a class="guide-install" href="${STAY_URL}" target="_blank" rel="noopener noreferrer">Åpne i App Store ↗</a>`,
      note: 'Du kan følge Stay sin «Enable Stay»-guide når appen åpnes. Vi viser de samme Safari-stegene her på norsk.',
      demo: `<div class="demo-content"><div class="demo-app-store">App Store</div><div class="demo-app">${logo}<div><strong>Stay for Safari</strong><small>Userscripts &amp; Ad blocking</small></div><span class="demo-pill demo-tap" style="margin-left:auto">HENT</span></div><div class="demo-store-line"></div><div class="demo-store-line"></div></div>`,
    },
    {
      title: "Slå på Stay i Safari",
      instruction: 'Åpne <strong>Safari</strong> på en nettside. Trykk på <strong>sidemenyen</strong> ved adressefeltet → <strong>Administrer utvidelser</strong> → slå på <strong>Stay</strong> → <strong>Ferdig</strong>.',
      note: 'På engelsk: Manage Extensions → Done. På eldre iOS er menyknappen merket aA.',
      demo: `<div class="demo-phase phase-one"><div class="demo-content"><div class="demo-store-line"></div><div class="demo-store-line"></div></div><div class="demo-address" style="bottom:-34px"><span class="demo-menu-icon demo-tap"></span><span>cashbacknorge.no</span></div></div><div class="demo-phase phase-two"><div class="demo-sheet"><div class="demo-row demo-tap">♧ &nbsp; Administrer utvidelser</div><div class="demo-row">aA &nbsp; Tekststørrelse</div></div></div><div class="demo-phase phase-three"><div class="demo-sheet"><div class="demo-sheet-title">Administrer utvidelser <span>Ferdig</span></div><div class="demo-search">Søk</div><div class="demo-row">${logo}<strong>Stay</strong><span class="demo-toggle on"></span></div></div></div>`,
    },
    {
      title: "La scriptet oppdatere seg",
      instruction: 'Åpne <strong>Stay-appen</strong>. Trykk på <strong>Settings</strong> nederst til høyre. Finn <strong>Silent Userscript Update</strong> under General og slå den på.',
      note: 'Da får du nye versjoner av Cashback Norge automatisk. Navnene inne i Stay er på engelsk.',
      dark: true,
      demo: `<div class="demo-content"><h4>Settings</h4><div class="demo-small" style="margin:8px 0">GENERAL</div><div class="demo-row"><span>Clear App Cache</span><span>›</span></div><div class="demo-row demo-tap"><span style="font-size:10px">Silent Userscript Update</span><span class="demo-toggle animated"></span></div></div>${tabs('settings')}`,
    },
    {
      title: "Legg til Cashback Norge",
      instruction: 'I Stay: trykk <strong>Userscripts</strong> nederst til venstre → <strong>+</strong> øverst til høyre → <strong>Link</strong>. Lim inn lenken under og trykk <strong>Continue</strong>.',
      extra: `<div class="guide-link"><code>${SCRIPT_URL}</code><button id="iphone-guide-copy" class="guide-copy" type="button" aria-label="Kopier scriptlenken">Kopier</button></div><p class="guide-note" id="guide-copy-status" role="status"></p>`,
      dark: true,
      demo: `<div class="demo-phase phase-one"><div class="demo-add-header">Userscripts <span class="demo-plus demo-tap">+</span></div><div class="demo-search" style="background:#292929;margin-top:15px">Search</div></div><div class="demo-phase phase-two"><div class="demo-sheet demo-add-sheet"><strong>Add Userscript</strong><div class="demo-row">New Userscript</div><div class="demo-row demo-tap">↗ &nbsp; Link</div></div></div><div class="demo-phase phase-three"><strong>Add with Link</strong><div class="demo-url">${SCRIPT_URL}</div><div class="demo-continue demo-tap">Continue</div></div>${tabs('scripts')}`,
    },
    {
      title: "Gi Stay tilgang til butikkene",
      instruction: 'Tilbake i <strong>Safari</strong>: åpne sidemenyen og trykk <strong>Stay</strong> → <strong>Tillat alltid…</strong> → <strong>Tillat alltid på alle nettsteder</strong>.',
      note: 'På engelsk: Always Allow… → Always Allow on Every Website. Har du allerede gjort dette i Stay-guiden, kan du gå videre.',
      demo: `<div class="demo-phase phase-one"><div class="demo-sheet"><div class="demo-row demo-tap">${logo}<strong>Stay</strong><span>›</span></div></div></div><div class="demo-phase phase-two"><div class="demo-sheet"><div class="demo-sheet-title">Stay</div><div class="demo-row demo-allow demo-tap">Tillat alltid…</div><div class="demo-row">Tillat én dag</div></div></div><div class="demo-phase phase-three"><div class="demo-sheet"><div class="demo-row demo-allow demo-tap">Tillat alltid på alle nettsteder</div><div class="demo-row">Kun dette nettstedet</div></div></div>`,
    },
    {
      title: "Prøv i en nettbutikk",
      instruction: 'Åpne <strong>Safari</strong> og besøk en butikk fra oversikten, for eksempel <a href="https://www.komplett.no/" target="_blank" rel="noopener noreferrer">Komplett.no</a>. <strong>Cashback Norge</strong> skal dukke opp nederst til venstre.',
      note: 'Ser du ingenting? Sjekk at scriptet ligger under Activated i Stay, og at Safari-tillatelsen gjelder alle nettsteder.',
      demo: `<div class="demo-content"><h4>Nettbutikk</h4><div class="demo-store-line"></div><div class="demo-store-line"></div><div class="demo-check">✓</div></div><div class="demo-cashback"><img src="favicon.png" alt=""><span><strong>Cashback Norge</strong>Se fordeler for denne butikken</span></div>${address}`,
    },
  ];
  let current = 0;
  try {
    const saved = Number(localStorage.getItem("cashback-iphone-step"));
    if (Number.isInteger(saved) && saved >= 0 && saved < steps.length) current = saved;
  } catch { /* The guide also works when storage is disabled. */ }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reducedMotion.matches;
  guide.innerHTML = `<div class="guide-heading"><div><h2>Cashback i Safari</h2><p>Seks små steg med Stay for Safari</p></div><button type="button" class="guide-close" aria-label="Lukk installasjonsguiden">×</button></div>
    <nav class="guide-steps" aria-label="Installasjonssteg">${steps.map((step, i) => `<button class="guide-step" type="button" data-step="${i}" aria-label="Steg ${i + 1}: ${step.title}" aria-controls="iphone-step-${i}">${i + 1}</button>`).join('')}</nav>
    <div class="guide-slides">${steps.map((step, i) => `<section class="guide-slide" id="iphone-step-${i}" aria-labelledby="iphone-step-title-${i}" ${i !== current ? 'hidden' : ''}><h3 id="iphone-step-title-${i}">${step.title}</h3><p class="guide-instruction">${step.instruction}</p>${step.extra || ''}${step.note ? `<p class="guide-note">${step.note}</p>` : ''}<div class="guide-demo" aria-hidden="true"><div class="demo-phone ${step.dark ? 'demo-stay' : ''}">${status}${step.demo}</div></div></section>`).join('')}</div>
    <div class="guide-animation-tools"><span>Forenklet visning · sveip for neste steg</span><button class="guide-animation-toggle" type="button" aria-pressed="${paused}">${paused ? 'Spill animasjon' : 'Pause animasjon'}</button></div>
    <div class="guide-nav"><button class="guide-prev" type="button">← Tilbake</button><span class="guide-progress"></span><button class="guide-next" type="button">Neste →</button></div><p class="guide-sr" aria-live="polite" id="guide-announcement"></p>`;
  const slides = [...guide.querySelectorAll('.guide-slide')];
  const stepButtons = [...guide.querySelectorAll('.guide-step')];
  const previous = guide.querySelector('.guide-prev');
  const next = guide.querySelector('.guide-next');
  const setStep = (step, announce = true) => {
    current = Math.max(0, Math.min(steps.length - 1, step));
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    stepButtons.forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.classList.toggle('is-complete', i < current);
    });
    // Restart the visual demonstration whenever its step is selected.
    const phone = slides[current].querySelector('.demo-phone');
    phone.replaceWith(phone.cloneNode(true));
    previous.disabled = current === 0;
    next.textContent = current === steps.length - 1 ? 'Ferdig ✓' : 'Neste →';
    guide.querySelector('.guide-progress').textContent = `${current + 1} / ${steps.length}`;
    if (announce) guide.querySelector('#guide-announcement').textContent = `Steg ${current + 1} av ${steps.length}: ${steps[current].title}`;
    if (announce && !guide.hidden) guide.scrollIntoView({ block: 'start', behavior: 'auto' });
    try { localStorage.setItem('cashback-iphone-step', String(current)); } catch { /* Optional. */ }
  };
  const setOpen = (open) => {
    guide.hidden = !open;
    guide.style.display = open ? 'block' : 'none';
    toggle.setAttribute('aria-expanded', String(open));
    arrow.style.transform = open ? 'rotate(90deg)' : '';
    if (open) {
      document.querySelector('.bonus-chips-portal').style.display = 'none';
      document.querySelector('.bonus-toggle').classList.remove('open');
      try { localStorage.setItem('cashback-bonus-open', '0'); } catch { /* Optional. */ }
      setStep(current, false);
      guide.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }
  };
  toggle.addEventListener('click', () => setOpen(guide.hidden || guide.style.display === 'none'));
  guide.querySelector('.guide-close').addEventListener('click', () => { setOpen(false); toggle.focus(); });
  stepButtons.forEach((button, i) => button.addEventListener('click', () => setStep(i)));
  previous.addEventListener('click', () => setStep(current - 1));
  next.addEventListener('click', () => {
    if (current < steps.length - 1) setStep(current + 1);
    else { setOpen(false); toggle.focus(); }
  });
  guide.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setStep(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  let swipeStart;
  guide.addEventListener('pointerdown', (event) => {
    swipeStart = event.isPrimary && event.button === 0 && !event.target.closest('a, button, code')
      ? { x: event.clientX, y: event.clientY } : undefined;
  }, { passive: true });
  guide.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setStep(current + (dx < 0 ? 1 : -1));
    swipeStart = undefined;
  }, { passive: true });
  guide.addEventListener('pointercancel', () => { swipeStart = undefined; }, { passive: true });
  const animationToggle = guide.querySelector('.guide-animation-toggle');
  animationToggle.addEventListener('click', () => {
    paused = !paused;
    guide.classList.toggle('motion-enabled', !paused);
    guide.classList.toggle('is-paused', paused);
    animationToggle.setAttribute('aria-pressed', String(paused));
    animationToggle.textContent = paused ? 'Spill animasjon' : 'Pause animasjon';
  });
  guide.classList.toggle('is-paused', paused);
  document.getElementById('iphone-guide-copy').addEventListener('click', async function () {
    const status = document.getElementById('guide-copy-status');
    try {
      await navigator.clipboard.writeText(SCRIPT_URL);
      this.textContent = 'Kopiert ✓';
      status.textContent = 'Lenken er kopiert. Lim den inn i Stay → Link.';
    } catch {
      status.textContent = 'Hold på lenken og velg Kopier, og lim den inn i Stay.';
    }
  });
  setStep(current, false);
  if (location.hash === '#iphone-guide') setOpen(true);
})();
