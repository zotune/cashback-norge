// Shared by the lightweight installation pages. Touch panning stays native.
window.mountInstallGuide = ({ guide, steps, storageKey }) => {
  const back = document.querySelector('.guide-back');
  back.href = '../' + location.search;
  const prefix = guide.id;
  const status = '<div class="demo-status"><span>9:41</span><span>▰ ▰ ●</span></div>';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  guide.innerHTML = `<div class="guide-slides" tabindex="0" aria-label="Installasjonssteg">${steps.map((step, i) => `<section class="guide-slide" id="${prefix}-step-${i}" aria-labelledby="${prefix}-title-${i}"><div class="guide-demo" aria-hidden="true"><div class="demo-phone ${step.dark ? 'demo-stay' : ''} ${step.phoneClass || ''}">${status}${step.demo}</div><div class="guide-progress" title="Animasjonen gjentas hvert 9. sekund"><span></span></div></div><div class="guide-text"><h2 id="${prefix}-title-${i}">${step.title}</h2><p class="guide-instruction">${step.instruction}</p>${step.extra || ''}${step.note ? `<p class="guide-note">${step.note}</p>` : ''}</div></section>`).join('')}</div>
    <div class="guide-nav"><button class="cbn-button guide-prev" type="button" aria-label="Forrige steg" title="Forrige steg">←</button><nav class="guide-dots" aria-label="Installasjonssteg">${steps.map((step, i) => `<button class="cbn-button cbn-button--quiet guide-dot" type="button" data-step="${i}" aria-label="Steg ${i + 1}: ${step.title}" aria-controls="${prefix}-step-${i}"><span></span></button>`).join('')}</nav><button class="cbn-button cbn-button--primary guide-next" type="button"></button></div><p class="guide-sr" aria-live="polite"></p>`;
  const slides = [...guide.querySelectorAll('.guide-slide')];
  const dots = [...guide.querySelectorAll('.guide-dot')];
  const viewport = guide.querySelector('.guide-slides');
  const previous = guide.querySelector('.guide-prev');
  const next = guide.querySelector('.guide-next');
  const announcement = guide.querySelector('.guide-sr');
  const clamp = (step) => Math.max(0, Math.min(steps.length - 1, step));
  let current = 0;
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isInteger(saved)) current = clamp(saved);
  } catch { /* Storage is optional. */ }
  let selected = -1;
  let requestedStep = null;
  let moving = false;
  let touchActive = false;
  let mouseDrag;
  let dragFrame = 0;
  let alignFrame = 0;
  let settleTimer;
  let width = viewport.clientWidth;
  // Actual slide edges also account for fractional widths and browser zoom.
  const edge = (step) => slides[step].getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
  const nearestStep = () => slides.reduce((nearest, _, i) =>
    Math.abs(edge(i) - viewport.scrollLeft) < Math.abs(edge(nearest) - viewport.scrollLeft) ? i : nearest, 0);
  const align = (step) => {
    const left = edge(step);
    if (Math.abs(viewport.scrollLeft - left) > .5) viewport.scrollTo({ left, behavior: 'instant' });
  };
  const fitSlide = () => {
    if (moving || touchActive || mouseDrag) return;
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
      dots.forEach((button, i) => {
        if (i === current) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      previous.disabled = current === 0;
      next.textContent = current === steps.length - 1 ? '✓' : '→';
      next.setAttribute('aria-label', current === steps.length - 1 ? 'Ferdig, tilbake til butikkene' : 'Neste steg');
      next.title = next.getAttribute('aria-label');
      try { localStorage.setItem(storageKey, String(current)); } catch { /* Optional. */ }
    }
    fitSlide();
    if (announce) announcement.textContent = `Steg ${current + 1} av ${steps.length}: ${steps[current].title}`;
  };
  const settle = () => {
    if (touchActive || mouseDrag) return;
    clearTimeout(settleTimer);
    const target = requestedStep ?? nearestStep();
    requestedStep = null;
    align(target);
    moving = false;
    selectStep(target, true);
    // Changing the final height can trigger another WebKit snap. Keep the same edge.
    cancelAnimationFrame(alignFrame);
    alignFrame = requestAnimationFrame(() => {
      alignFrame = 0;
      if (!moving && !touchActive && !mouseDrag) align(current);
    });
  };
  const scheduleSettle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 220);
  };
  const goTo = (step, smooth = true) => {
    const target = clamp(step);
    if (target !== current && document.activeElement?.closest('.guide-slide')) viewport.focus({ preventScroll: true });
    requestedStep = target;
    moving = true;
    viewport.scrollTo({ left: edge(target), behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
    if (!smooth || reducedMotion.matches) settle();
    else scheduleSettle();
  };
  // Never change height or inert states while a finger or momentum is moving the slides.
  viewport.addEventListener('scroll', () => { moving = true; scheduleSettle(); }, { passive: true });
  viewport.addEventListener('scrollend', settle);
  viewport.addEventListener('wheel', () => { requestedStep = null; }, { passive: true });
  viewport.addEventListener('touchstart', () => {
    touchActive = moving = true;
    requestedStep = null;
    clearTimeout(settleTimer);
  }, { passive: true });
  const finishTouch = () => { touchActive = false; scheduleSettle(); };
  viewport.addEventListener('touchend', finishTouch, { passive: true });
  viewport.addEventListener('touchcancel', finishTouch, { passive: true });
  const resizeObserver = new ResizeObserver(() => {
    const resizedWidth = viewport.clientWidth;
    if (resizedWidth > 0 && resizedWidth !== width) {
      width = resizedWidth;
      if (!touchActive && !mouseDrag) goTo(requestedStep ?? current, false);
    }
    fitSlide();
  });
  resizeObserver.observe(viewport);
  slides.forEach((slide) => resizeObserver.observe(slide));
  dots.forEach((button, i) => button.addEventListener('click', () => goTo(i)));
  previous.addEventListener('click', () => goTo((requestedStep ?? current) - 1));
  next.addEventListener('click', () => {
    const step = requestedStep ?? current;
    if (step < steps.length - 1) goTo(step + 1);
    else location.assign(back.href);
  });
  guide.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo((requestedStep ?? current) + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  // Desktop mouse dragging; native touch gestures are never captured or cancelled.
  viewport.addEventListener('pointerdown', (event) => {
    requestedStep = null;
    if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || event.target.closest('a, button, code')) return;
    mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, start: nearestStep(), left: viewport.scrollLeft, dx: 0, dragging: false };
  }, { passive: true });
  viewport.addEventListener('pointermove', (event) => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const dx = event.clientX - mouseDrag.x;
    const dy = event.clientY - mouseDrag.y;
    if (!mouseDrag.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      if (Math.abs(dy) >= Math.abs(dx)) { mouseDrag = undefined; return; }
      mouseDrag.dragging = moving = true;
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
  const syncVisibility = () => guide.classList.toggle('is-background', document.hidden);
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  window.addEventListener('pagehide', () => {
    clearTimeout(settleTimer);
    cancelAnimationFrame(alignFrame);
    cancelAnimationFrame(dragFrame);
    alignFrame = dragFrame = 0;
    mouseDrag = undefined;
    touchActive = moving = false;
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
  goTo(current, false);
};
