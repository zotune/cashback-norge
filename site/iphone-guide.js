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
  const status = '<div class="demo-status"><span>9:41</span><span>▰ ▰ ●</span></div>';
  const logo = '<span class="demo-stay-logo">S</span>';
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
      extra: `<div class="guide-link"><code>${SCRIPT_URL}</code><button id="iphone-guide-copy" class="guide-copy" type="button" aria-label="Kopier scriptlenken">Kopier</button></div><p class="guide-note" id="guide-copy-status" role="status"></p>`,
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
      demo: `<div class="demo-content"><h4>Nettbutikk</h4><div class="demo-store-line"></div><div class="demo-store-line"></div><div class="demo-check">✓</div></div><div class="demo-cashback"><img src="../favicon.png" alt=""><span><strong>Cashback Norge</strong>Se fordeler for denne butikken</span></div>${address}`,
    },
  ];
  let current = 0;
  try {
    const saved = Number(localStorage.getItem("cashback-iphone-step"));
    if (Number.isInteger(saved) && saved >= 0 && saved < steps.length) current = saved;
  } catch { /* The guide also works when storage is disabled. */ }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  guide.innerHTML = `<div class="guide-slides" tabindex="0" aria-label="Installasjonssteg">${steps.map((step, i) => `<section class="guide-slide" id="iphone-step-${i}" aria-labelledby="iphone-step-title-${i}"><div class="guide-demo" aria-hidden="true"><div class="demo-phone ${step.dark ? 'demo-stay' : ''}">${status}${step.demo}</div></div><div class="guide-text"><h2 id="iphone-step-title-${i}">${step.title}</h2><p class="guide-instruction">${step.instruction}</p>${step.extra || ''}${step.note ? `<p class="guide-note">${step.note}</p>` : ''}</div></section>`).join('')}</div>
    <div class="guide-nav"><button class="guide-prev" type="button" aria-label="Forrige steg" title="Forrige steg">←</button><nav class="guide-dots" aria-label="Installasjonssteg">${steps.map((step, i) => `<button class="guide-dot" type="button" data-step="${i}" aria-label="Steg ${i + 1}: ${step.title}" aria-controls="iphone-step-${i}"><span></span></button>`).join('')}</nav><button class="guide-next" type="button"></button></div><p class="guide-sr" aria-live="polite" id="guide-announcement"></p>`;
  const slides = [...guide.querySelectorAll('.guide-slide')];
  const stepButtons = [...guide.querySelectorAll('.guide-dot')];
  const viewport = guide.querySelector('.guide-slides');
  const previous = guide.querySelector('.guide-prev');
  const next = guide.querySelector('.guide-next');
  const announcement = guide.querySelector('#guide-announcement');
  const clamp = (step) => Math.max(0, Math.min(steps.length - 1, step));
  let width = viewport.clientWidth;
  let selected = -1;
  let requestedStep = null;
  let scrollFrame = 0;
  let settleTimer;
  const fitSlide = () => {
    const height = `${slides[current].offsetHeight}px`;
    if (viewport.style.height !== height) viewport.style.height = height;
  };

  const selectStep = (step, announce = false) => {
    current = clamp(step);
    if (selected !== current) {
      selected = current;
      slides.forEach((slide, i) => {
        slide.inert = i !== current;
        slide.setAttribute('aria-hidden', String(i !== current));
      });
      stepButtons.forEach((button, i) => {
        if (i === current) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      previous.disabled = current === 0;
      next.textContent = current === steps.length - 1 ? '✓' : '→';
      next.setAttribute('aria-label', current === steps.length - 1 ? 'Ferdig, tilbake til butikkene' : 'Neste steg');
      next.title = next.getAttribute('aria-label');
      fitSlide();
      try { localStorage.setItem('cashback-iphone-step', String(current)); } catch { /* Optional. */ }
    }
    if (announce) announcement.textContent = `Steg ${current + 1} av ${steps.length}: ${steps[current].title}`;
  };
  const goTo = (step, smooth = true) => {
    const target = clamp(step);
    if (target !== current && document.activeElement.closest('.guide-slide')) viewport.focus({ preventScroll: true });
    selectStep(target, smooth);
    requestedStep = target;
    viewport.scrollTo({ left: target * width, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
  };
  const nearestStep = () => clamp(Math.round(viewport.scrollLeft / width));
  const settle = () => {
    if (mouseDrag) return;
    clearTimeout(settleTimer);
    requestedStep = null;
    selectStep(nearestStep(), true);
  };
  // Touch scrolling and snapping belong to the browser. Only update controls when the step changes.
  viewport.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (requestedStep === null) selectStep(nearestStep());
    });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 180); // Fallback for browsers without scrollend.
  }, { passive: true });
  viewport.addEventListener('scrollend', settle);
  viewport.addEventListener('wheel', () => { requestedStep = null; }, { passive: true });
  const resizeObserver = new ResizeObserver(() => {
    const resizedWidth = viewport.clientWidth;
    if (resizedWidth > 0 && resizedWidth !== width) {
      width = resizedWidth;
      goTo(current, false);
    }
    fitSlide();
  });
  resizeObserver.observe(viewport);
  slides.forEach((slide) => resizeObserver.observe(slide));
  stepButtons.forEach((button, i) => button.addEventListener('click', () => goTo(i)));
  previous.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => {
    if (current < steps.length - 1) goTo(current + 1);
    else location.assign(back.href);
  });
  guide.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });

  // Mouse dragging is a desktop convenience; never capture or cancel a touch gesture.
  let mouseDrag;
  let dragFrame = 0;
  viewport.addEventListener('pointerdown', (event) => {
    requestedStep = null;
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || event.target.closest('a, button, code')) return;
    mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, start: current, left: viewport.scrollLeft, dx: 0, dragging: false };
  }, { passive: true });
  viewport.addEventListener('pointermove', (event) => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const dx = event.clientX - mouseDrag.x;
    const dy = event.clientY - mouseDrag.y;
    if (!mouseDrag.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      if (Math.abs(dy) >= Math.abs(dx)) { mouseDrag = undefined; return; }
      mouseDrag.dragging = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    }
    event.preventDefault();
    mouseDrag.dx = dx;
    if (!dragFrame) dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (mouseDrag) viewport.scrollLeft = mouseDrag.left - mouseDrag.dx;
    });
  });
  const finishDrag = (event, cancelled = false) => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const gesture = mouseDrag;
    mouseDrag = undefined;
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (!gesture.dragging) return;
    const dx = event.clientX - gesture.x;
    const distance = Math.abs(dx);
    const quickSwipe = distance > 24 && distance / Math.max(1, event.timeStamp - gesture.time) > .45;
    const advance = !cancelled && (distance > Math.max(44, width * .18) || quickSwipe);
    goTo(advance ? gesture.start + (dx < 0 ? 1 : -1) : gesture.start);
  };
  viewport.addEventListener('pointerup', (event) => finishDrag(event), { passive: true });
  viewport.addEventListener('pointercancel', (event) => finishDrag(event, true), { passive: true });
  viewport.addEventListener('lostpointercapture', (event) => finishDrag(event, true), { passive: true });
  document.addEventListener('visibilitychange', () => guide.classList.toggle('is-background', document.hidden));
  window.addEventListener('pagehide', () => {
    clearTimeout(settleTimer);
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(dragFrame);
    scrollFrame = dragFrame = 0;
    mouseDrag = undefined;
    viewport.classList.remove('is-dragging');
    resizeObserver.disconnect();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      resizeObserver.observe(viewport);
      slides.forEach((slide) => resizeObserver.observe(slide));
      goTo(current, false);
    }
  });
  document.getElementById('iphone-guide-copy').addEventListener('click', async function () {
    const status = document.getElementById('guide-copy-status');
    try {
      await navigator.clipboard.writeText(SCRIPT_URL);
      this.textContent = 'Kopiert ✓';
      status.textContent = 'Lim lenken inn i Stay → Link.';
    } catch {
      status.textContent = 'Hold på lenken og velg Kopier, og lim den inn i Stay.';
    }
  });
  goTo(current, false);
})();
