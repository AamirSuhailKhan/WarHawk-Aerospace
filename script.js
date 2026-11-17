(() => {
  'use strict';
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const finePointer = matchMedia('(pointer: fine)');
  const header = qs('#site-header');
  const loader = qs('#loader');

  // 1. Fast eagle landing & aperture opening (skips safely on subpages or reduced motion)
  if (loader) {
    if (reduceMotion.matches) {
      loader.style.display = 'none';
      document.body.classList.add('is-ready');
    } else {
      document.body.classList.add('loading');
      const start = performance.now();
      const duration = 640;
      const bar = qs('#loaderBar');
      const step = (now) => {
        const p = clamp((now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        if (bar) bar.style.width = `${(eased * 100).toFixed(2)}%`;
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          loader.classList.add('opening');
          document.body.classList.remove('loading');
          document.body.classList.add('is-ready');
          window.setTimeout(() => loader.remove(), 760);
        }
      };
      requestAnimationFrame(step);
    }
  } else {
    document.body.classList.add('is-ready');
  }

  // 2. Mobile navigation
  const toggle = qs('#menu-toggle');
  const mobileNav = qs('#mobile-nav');
  const mobileBackdrop = qs('#mobile-nav-backdrop');

  if (toggle && mobileNav) {
    const closeMenu = () => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      mobileNav.hidden = true;
      if (mobileBackdrop) mobileBackdrop.hidden = true;
      document.body.classList.remove('menu-open');
    };

    const openMenu = () => {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation');
      mobileNav.hidden = false;
      if (mobileBackdrop) mobileBackdrop.hidden = false;
      document.body.classList.add('menu-open');
    };

    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    if (mobileBackdrop) {
      mobileBackdrop.addEventListener('click', closeMenu);
    }

    qsa('#mobile-nav a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    mobile.addEventListener('change', closeMenu);
  }

  // 3. Interactive capability card hash highlight
  function highlightTargetCard() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const card = qs(`#${CSS.escape(hash)}.cap-card`);
    if (!card) return;
    qsa('.cap-card.is-highlighted').forEach((c) => c.classList.remove('is-highlighted'));
    card.classList.add('is-highlighted');
    window.setTimeout(() => card.classList.remove('is-highlighted'), 2200);
  }
  window.addEventListener('hashchange', highlightTargetCard);
  highlightTargetCard();

  // 3b. Interactive capability filter tabs
  const filterBtns = qsa('.cap-filter-btn');
  const capCards = qsa('.cap-card');
  if (filterBtns.length && capCards.length) {
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter') || 'all';
        filterBtns.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('is-active', isActive);
          b.setAttribute('aria-selected', String(isActive));
        });
        capCards.forEach((card) => {
          const cat = card.getAttribute('data-category') || '';
          const match = filter === 'all' || cat === filter;
          card.classList.toggle('is-hidden', !match);
        });
      });
    });
  }

  // 4. Unified scroll reveal observer
  const revealItems = qsa(
    '.manifesto-title,.manifesto-bottom,.manifesto-pillar,.cap-title-row h2,.cap-title-row p,.cap-card,.pricing-card,.contact-inner,.contact-copy,.contact-panel,.footer-col'
  );
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    revealItems.forEach((node) => node.classList.add('reveal-element'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
    );
    revealItems.forEach((item) => observer.observe(item));
  }

  // 5. Active section scroll-spy for homepage navigation
  const navSections = ['manifesto', 'flight', 'capabilities', 'pricing', 'contact']
    .map((id) => ({ id, el: qs(`#${id}`) }))
    .filter((entry) => entry.el);

  const navLinks = qsa('[data-nav]');
  function updateActiveNav() {
    if (!navSections.length || !navLinks.length) return;
    const marker = innerHeight * 0.38;
    let currentId = '';
    for (const sec of navSections) {
      const rect = sec.el.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > 90) {
        currentId = sec.id;
      }
    }
    navLinks.forEach((link) => {
      const isMatch = link.getAttribute('data-nav') === currentId;
      link.classList.toggle('is-active', isMatch);
      if (isMatch) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  // 6. Damped cinematic scroll & pointer motion engine
  const hero = qs('.hero');
  const heroHeadline = qs('.hero-headline');
  const heroField = qs('#hero-drone-field');
  const manifesto = qs('#manifesto');
  const manifestoRule = qs('.manifesto-rule');
  const flight = qs('#flight');
  const flightDrone = qs('#flight-drone-shell');
  const flightRings = qsa('.flight-center-mark .ring');
  const timelineFill = qs('#timelineFill');
  const flightStageLabel = qs('#flight-stage-label');
  const flightPercent = qs('#flight-percent');
  const chapters = qsa('[data-chapter]');
  const interlude = qs('.interlude');
  const interludeMain = qs('.interlude-main');
  const interludeLines = qsa('.interlude-heading span');
  const interludeSub = qs('.interlude-sub');
  const systems = qs('#systems');
  const systemsCopy = qs('.systems-copy');
  const systemsFrame = qs('.systems-frame');
  const systemsDrone = qs('.systems-drone');
  const systemsRadar = qs('.systems-radar');
  const contact = qs('.contact') || qs('.contact-page-hero');
  const contactGrid = qs('.contact-grid-wrap');
  const progressBar = qs('#page-progress');

  const STAGE_NAMES = [
    'STAGE 01 / INTRODUCTION',
    'STAGE 02 / APPROACH',
    'STAGE 03 / ELEVATION',
    'STAGE 04 / ARCHITECTURE',
    'STAGE 05 / CAPABILITY',
    'STAGE 06 / TRANSITION'
  ];

  const knots = [
    { p: 0.0, x: 18, y: 2, s: 0.94, rz: -2.5, ry: -9 },
    { p: 0.24, x: 16, y: 0, s: 1.02, rz: -1.0, ry: -4 },
    { p: 0.50, x: -16, y: 1, s: 1.06, rz: 2.5, ry: 7 },
    { p: 0.78, x: 16, y: -1, s: 1.08, rz: -1.5, ry: -5 },
    { p: 1.0, x: 15, y: -2, s: 1.12, rz: 0.0, ry: 0 }
  ];

  function samplePath(progress) {
    let from = knots[0];
    let to = knots[knots.length - 1];
    for (let i = 0; i < knots.length - 1; i++) {
      if (progress <= knots[i + 1].p) {
        from = knots[i];
        to = knots[i + 1];
        break;
      }
    }
    const t = smoothstep(clamp((progress - from.p) / Math.max(0.001, to.p - from.p)));
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      s: lerp(from.s, to.s, t),
      rz: lerp(from.rz, to.rz, t),
      ry: lerp(from.ry, to.ry, t)
    };
  }

  const sectionProgress = (section) => {
    const rect = section.getBoundingClientRect();
    const range = Math.max(1, rect.height - innerHeight);
    return clamp(-rect.top / range);
  };

  const viewProgress = (section) => {
    const rect = section.getBoundingClientRect();
    return clamp((innerHeight - rect.top) / (innerHeight + rect.height));
  };

  const visibleNear = (rect) => rect.bottom > -innerHeight * 0.25 && rect.top < innerHeight * 1.25;

  const state = {
    scrollRatio: 0,
    flight: 0,
    systems: 0,
    interlude: 0.5,
    manifesto: 0,
    contact: 0.5,
    px: 0,
    py: 0,
    targetPx: 0,
    targetPy: 0,
    activeChapter: -1,
    activeStage: -1,
    sheenPlayed: false
  };

  let rafId = 0;

  function renderFrame() {
    rafId = 0;
    const damp = 0.09;
    let needsMore = false;

    const scrollable = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const targetScrollRatio = clamp(scrollY / scrollable);
    state.scrollRatio = lerp(state.scrollRatio, targetScrollRatio, 0.18);
    if (Math.abs(targetScrollRatio - state.scrollRatio) > 0.0004) needsMore = true;

    if (progressBar) progressBar.style.width = `${(state.scrollRatio * 100).toFixed(2)}%`;
    if (header) header.classList.toggle('is-scrolled', scrollY > 30);
    updateActiveNav();

    if (reduceMotion.matches) return;

    if (hero) {
      const heroRect = hero.getBoundingClientRect();
      if (visibleNear(heroRect)) {
        state.px = lerp(state.px, state.targetPx, 0.08);
        state.py = lerp(state.py, state.targetPy, 0.08);
        if (Math.abs(state.targetPx - state.px) > 0.001 || Math.abs(state.targetPy - state.py) > 0.001) {
          needsMore = true;
        }
        const heroDrop = clamp(-heroRect.top / Math.max(1, heroRect.height));
        if (heroHeadline) {
          const fgX = state.px * 7;
          const fgY = state.py * 5 - heroDrop * 44;
          heroHeadline.style.transform = `translate3d(${fgX.toFixed(2)}px, ${fgY.toFixed(2)}px, 0)`;
        }
        if (heroField) {
          if (mobile.matches) {
            const ty = heroDrop * 16;
            heroField.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0)`;
          } else {
            const tx = -state.px * 15;
            const ty = -state.py * 10 + heroDrop * 26;
            const rx = state.py * 2.6;
            const ry = -state.px * 3.2;
            const heroScale = 1 + heroDrop * 0.08;
            heroField.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${heroScale.toFixed(4)})`;
          }
        }
      }
    }

    if (manifesto && manifestoRule) {
      const mRect = manifesto.getBoundingClientRect();
      if (visibleNear(mRect)) {
        const targetM = clamp((innerHeight * 0.9 - mRect.top) / (innerHeight * 0.75));
        state.manifesto = lerp(state.manifesto, targetM, damp);
        if (Math.abs(targetM - state.manifesto) > 0.0005) needsMore = true;
        manifestoRule.style.transform = `scaleX(${lerp(0.08, 1, smoothstep(state.manifesto)).toFixed(4)})`;
      }
    }

    if (flight && flightDrone) {
      const fRect = flight.getBoundingClientRect();
      if (visibleNear(fRect)) {
        const targetF = sectionProgress(flight);
        state.flight = lerp(state.flight, targetF, damp);
        if (Math.abs(targetF - state.flight) > 0.0004) needsMore = true;

        const v = samplePath(state.flight);
        const narrow = mobile.matches;
        const x = narrow ? v.x * 0.12 : v.x;
        const y = narrow ? v.y * 0.6 : v.y;
        const scale = narrow ? v.s * 0.86 : v.s;
        const ry = narrow ? v.ry * 0.4 : v.ry;

        flightDrone.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0) rotateY(${ry.toFixed(2)}deg) rotate(${v.rz.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
        if (timelineFill) timelineFill.style.width = `${(state.flight * 100).toFixed(2)}%`;
        if (flightPercent) flightPercent.textContent = `${String(Math.round(state.flight * 100)).padStart(3, '0')}%`;

        const stageIdx = Math.min(5, Math.floor(state.flight * 6));
        if (stageIdx !== state.activeStage && flightStageLabel) {
          flightStageLabel.textContent = STAGE_NAMES[stageIdx];
          state.activeStage = stageIdx;
        }

        if (flightRings[0]) flightRings[0].style.transform = `rotate(${(state.flight * 28).toFixed(2)}deg)`;
        if (flightRings[1]) flightRings[1].style.transform = `rotate(${(-state.flight * 54).toFixed(2)}deg)`;
        if (flightRings[2]) flightRings[2].style.transform = `rotate(${(state.flight * 36).toFixed(2)}deg) scale(${lerp(0.95, 1.06, state.flight).toFixed(3)})`;

        const active = state.flight < 0.33 ? 0 : state.flight < 0.67 ? 1 : 2;
        if (active !== state.activeChapter) {
          chapters.forEach((node, index) => node.classList.toggle('active', index === active));
          state.activeChapter = active;
        }
      }
    }

    if (interlude && interludeMain) {
      const iRect = interlude.getBoundingClientRect();
      if (visibleNear(iRect)) {
        const targetI = viewProgress(interlude);
        state.interlude = lerp(state.interlude, targetI, damp);
        if (Math.abs(targetI - state.interlude) > 0.0005) needsMore = true;

        const centered = 1 - Math.min(1, Math.abs(state.interlude - 0.5) * 2.2);
        const split = (1 - smoothstep(centered)) * (mobile.matches ? 0.6 : 1.8);
        if (interludeLines[0]) interludeLines[0].style.transform = `translate3d(${(-split).toFixed(2)}vw, 0, 0)`;
        if (interludeLines[1]) interludeLines[1].style.transform = `translate3d(${split.toFixed(2)}vw, 0, 0)`;

        const scale = lerp(0.93, 1.02, smoothstep(centered));
        interludeMain.style.transform = `translate3d(0, ${((0.5 - state.interlude) * 36).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        if (interludeSub) interludeSub.style.opacity = lerp(0.4, 1, smoothstep(centered)).toFixed(3);
      }
    }

    if (systems && systemsFrame) {
      const sRect = systems.getBoundingClientRect();
      if (visibleNear(sRect)) {
        const targetS = sectionProgress(systems);
        state.systems = lerp(state.systems, targetS, damp);
        if (Math.abs(targetS - state.systems) > 0.0004) needsMore = true;

        const eased = smoothstep(state.systems);
        const narrow = mobile.matches;

        const rotY = lerp(narrow ? -6 : -13, 0, eased);
        const rotX = lerp(4, 0, eased);
        const frameScale = lerp(0.92, narrow ? 1.0 : 1.03, eased);
        const frameY = lerp(narrow ? 2 : 4, 0, eased);

        systemsFrame.style.transform = `translate3d(0, ${frameY.toFixed(2)}vh, 0) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) scale(${frameScale.toFixed(4)})`;

        if (systemsDrone) {
          systemsDrone.style.transform = `scale(${lerp(1.14, 1.0, eased).toFixed(4)})`;
        }
        if (systemsRadar) {
          systemsRadar.style.transform = `rotate(${(eased * 22).toFixed(2)}deg) scale(${lerp(0.88, 1.04, eased).toFixed(4)})`;
        }
        if (systemsCopy) {
          const copyShift = lerp(18, -12, eased);
          systemsCopy.style.transform = narrow
            ? `translate3d(0, ${(copyShift * 0.4).toFixed(1)}px, 0)`
            : `translate3d(0, calc(-50% + ${copyShift.toFixed(1)}px), 0)`;
        }
        if (eased > 0.48 && !state.sheenPlayed) {
          systemsFrame.classList.add('sheen');
          state.sheenPlayed = true;
        }
      }
    }

    if (contact && contactGrid) {
      const cRect = contact.getBoundingClientRect();
      if (visibleNear(cRect)) {
        const targetC = viewProgress(contact);
        state.contact = lerp(state.contact, targetC, damp);
        if (Math.abs(targetC - state.contact) > 0.0005) needsMore = true;
        contactGrid.style.transform = `translate3d(0, ${((0.5 - state.contact) * 32).toFixed(1)}px, 0)`;
      }
    }

    if (needsMore) {
      rafId = requestAnimationFrame(renderFrame);
    }
  }

  function kick() {
    if (!rafId) rafId = requestAnimationFrame(renderFrame);
  }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick, { passive: true });
  kick();

  if (finePointer.matches && !reduceMotion.matches && hero) {
    hero.addEventListener(
      'pointermove',
      (event) => {
        state.targetPx = (event.clientX / innerWidth - 0.5) * 2;
        state.targetPy = (event.clientY / innerHeight - 0.5) * 2;
        kick();
      },
      { passive: true }
    );
    hero.addEventListener('pointerleave', () => {
      state.targetPx = 0;
      state.targetPy = 0;
      kick();
    });
  }

  // 7. Ambient moving background particles & drifting starfields
  const bgCanvases = qsa('.bg-canvas');
  if (bgCanvases.length) {
    const configs = {
      hero: { count: 50, vx: -0.32, vy: -0.38, minR: 0.8, maxR: 2.0, glow: true },
      flight: { count: 56, vx: -1.25, vy: 0.14, minR: 0.7, maxR: 1.9, streak: true },
      stars: { count: 92, vx: 0.36, vy: -0.46, minR: 0.8, maxR: 2.3, glow: true },
      subtle: { count: 40, vx: 0.24, vy: -0.3, minR: 0.8, maxR: 1.8, glow: false }
    };

    const layers = bgCanvases.map((canvas) => {
      const mode = canvas.dataset.mode || 'stars';
      const cfg = configs[mode] || configs.stars;
      const ctx = canvas.getContext('2d');
      const section = canvas.closest('section');
      const count = mobile.matches ? Math.round(cfg.count * 0.6) : cfg.count;
      const particles = Array.from({ length: count }, (_, i) => {
        const depth = 0.35 + ((i * 19) % 100) / 140;
        return {
          x: Math.random(),
          y: Math.random(),
          r: lerp(cfg.minR, cfg.maxR, depth),
          depth,
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.7 + Math.random() * 1.6,
          tint: i % 5 === 0 ? '244,247,251' : i % 3 === 0 ? '64,141,216' : '201,255,94'
        };
      });
      return { canvas, ctx, section, cfg, particles, w: 0, h: 0 };
    });

    const sizeCanvases = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      layers.forEach((layer) => {
        const rect = layer.canvas.getBoundingClientRect();
        layer.w = Math.max(1, rect.width);
        layer.h = Math.max(1, rect.height);
        layer.canvas.width = Math.round(layer.w * dpr);
        layer.canvas.height = Math.round(layer.h * dpr);
        layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    };
    sizeCanvases();
    addEventListener('resize', sizeCanvases, { passive: true });

    let lastTime = performance.now();
    const drawAmbient = (now) => {
      const dt = Math.min(48, now - lastTime) / 16.667;
      lastTime = now;
      const tSec = now * 0.001;

      layers.forEach((layer) => {
        const { ctx, section, cfg, particles, w, h } = layer;
        if (!ctx || !section || !visibleNear(section.getBoundingClientRect())) return;
        ctx.clearRect(0, 0, w, h);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (!reduceMotion.matches) {
            p.x += (cfg.vx * p.depth * dt) / Math.max(300, w);
            p.y += (cfg.vy * p.depth * dt) / Math.max(300, h);
            if (p.x < -0.02) p.x += 1.04;
            if (p.x > 1.02) p.x -= 1.04;
            if (p.y < -0.02) p.y += 1.04;
            if (p.y > 1.02) p.y -= 1.04;
          }
          const px = p.x * w;
          const py = p.y * h;
          const alpha = 0.22 + 0.56 * (0.5 + 0.5 * Math.sin(tSec * p.twinkle + p.phase));

          if (cfg.streak) {
            ctx.strokeStyle = `rgba(${p.tint},${(alpha * 0.62).toFixed(3)})`;
            ctx.lineWidth = p.r * 0.85;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + 10 * p.depth, py - 1.2 * p.depth);
            ctx.stroke();
          } else {
            if (cfg.glow && p.r > 1.45) {
              ctx.fillStyle = `rgba(${p.tint},${(alpha * 0.16).toFixed(3)})`;
              ctx.beginPath();
              ctx.arc(px, py, p.r * 3.1, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = `rgba(${p.tint},${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(px, py, p.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      if (!reduceMotion.matches) {
        requestAnimationFrame(drawAmbient);
      }
    };

    requestAnimationFrame(drawAmbient);
  }
})();
