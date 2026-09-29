/* Team N!TRO — interaction layer */
(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* unavailable */ } },
    session(key, value) {
      try {
        if (value === undefined) return sessionStorage.getItem(key);
        sessionStorage.setItem(key, value);
      } catch (_) { /* unavailable */ }
      return null;
    }
  };

  const reducedEffectsSaved = storage.get('nitro-reduced-effects') === 'true';

  /* ----- reveal on scroll (started after the boot sequence) ----- */

  const revealItems = $$('.reveal');
  let revealsStarted = false;

  const startReveals = () => {
    if (revealsStarted) return;
    revealsStarted = true;
    if ('IntersectionObserver' in window && !prefersReducedMotion.matches && !root.classList.contains('reduced-effects')) {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.09, rootMargin: '0px 0px -7% 0px' });
      revealItems.forEach((item) => revealObserver.observe(item));
    } else {
      revealItems.forEach((item) => item.classList.add('is-visible'));
    }
  };

  /* ----- boot sequence: once per session, always skippable ----- */

  const boot = $('#boot');
  const finishBoot = () => {
    if (!boot || boot.classList.contains('is-finished')) return;
    boot.classList.add('is-finished');
    storage.session('nitro-boot-seen', 'true');
    startReveals();
    window.setTimeout(() => boot.remove(), 950);
  };

  const skipBoot = prefersReducedMotion.matches
    || reducedEffectsSaved
    || storage.session('nitro-boot-seen') === 'true'
    || new URLSearchParams(location.search).has('skipIntro');

  if (!boot) {
    startReveals();
  } else if (skipBoot) {
    boot.remove();
    startReveals();
  } else {
    window.setTimeout(finishBoot, 2400);
    boot.addEventListener('click', finishBoot);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') finishBoot();
    });
  }

  /* ----- scroll chrome: progress, header, back to top ----- */

  const header = $('#site-header');
  const progress = $('#scroll-progress');
  const backTop = $('#back-top');
  let scrollFrame = 0;

  const updateScrollUI = () => {
    const y = window.scrollY;
    const max = Math.max(root.scrollHeight - window.innerHeight, 1);
    if (progress) progress.style.transform = `scaleX(${Math.min(y / max, 1)})`;
    header?.classList.toggle('is-scrolled', y > 24);
    backTop?.classList.toggle('is-visible', y > window.innerHeight * 0.7);
    scrollFrame = 0;
  };

  const queueScrollUI = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollUI);
  };

  addEventListener('scroll', queueScrollUI, { passive: true });
  addEventListener('resize', queueScrollUI, { passive: true });
  updateScrollUI();

  backTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: root.classList.contains('reduced-effects') || prefersReducedMotion.matches ? 'auto' : 'smooth' });
  });

  /* ----- navigation ----- */

  const menuToggle = $('.menu-toggle');
  const nav = $('#site-nav');

  const closeMenu = () => {
    menuToggle?.setAttribute('aria-expanded', 'false');
    nav?.classList.remove('is-open');
    body.classList.remove('menu-open');
  };

  menuToggle?.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    body.classList.toggle('menu-open', open);
  });

  $$('#site-nav a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('click', (event) => {
    if (nav?.classList.contains('is-open') && !header.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  /* scrollspy */
  const navLinks = $$('#site-nav a[href^="#"]');
  const sections = navLinks.map((link) => $(link.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const spyObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => {
        if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-35% 0px -52% 0px', threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => spyObserver.observe(section));
  }

  /* ----- glass sheen follows the pointer ----- */

  $$('[data-glass]').forEach((item) => {
    item.addEventListener('pointermove', (event) => {
      const rect = item.getBoundingClientRect();
      item.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      item.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    }, { passive: true });
  });

  /* ----- cursor halo + magnetic buttons (fine pointers only) ----- */

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer) {
    const ring = $('.cursor--ring');
    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let cursorFrame = 0;

    const renderCursor = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      cursorFrame = requestAnimationFrame(renderCursor);
    };

    if (ring) {
      addEventListener('pointermove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        ring.classList.add('is-visible');
        if (!cursorFrame) renderCursor();
      }, { passive: true });

      $$('a, button, summary, input, select, textarea').forEach((target) => {
        target.addEventListener('pointerenter', () => ring.classList.add('is-active'));
        target.addEventListener('pointerleave', () => ring.classList.remove('is-active'));
      });
    }

    $$('.magnetic').forEach((item) => {
      item.addEventListener('pointermove', (event) => {
        if (root.classList.contains('reduced-effects') || prefersReducedMotion.matches) return;
        const rect = item.getBoundingClientRect();
        item.style.setProperty('--button-shift-x', `${(event.clientX - rect.left - rect.width / 2) * 0.12}px`);
        item.style.setProperty('--button-shift-y', `${(event.clientY - rect.top - rect.height / 2) * 0.12}px`);
      });
      item.addEventListener('pointerleave', () => {
        item.style.setProperty('--button-shift-x', '0px');
        item.style.setProperty('--button-shift-y', '0px');
      });
    });
  }

  /* ----- the interactive atom ----- */

  const atom = $('#atom');
  const atomTilt = $('#atom-tilt');
  const atomCore = $('#atom-core');

  if (atom && atomTilt && finePointer) {
    let targetX = 0;
    let targetY = 0;
    let tiltX = 0;
    let tiltY = 0;
    let tiltFrame = 0;

    const renderTilt = () => {
      tiltX += (targetX - tiltX) * 0.08;
      tiltY += (targetY - tiltY) * 0.08;
      atomTilt.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
      atomTilt.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
      if (Math.abs(targetX - tiltX) > 0.02 || Math.abs(targetY - tiltY) > 0.02) {
        tiltFrame = requestAnimationFrame(renderTilt);
      } else {
        tiltFrame = 0;
      }
    };

    const queueTilt = () => {
      if (!tiltFrame) tiltFrame = requestAnimationFrame(renderTilt);
    };

    addEventListener('pointermove', (event) => {
      if (root.classList.contains('reduced-effects') || prefersReducedMotion.matches) return;
      const rect = atom.getBoundingClientRect();
      if (rect.bottom < -160 || rect.top > innerHeight + 160) return;
      const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
      targetY = Math.max(-1.6, Math.min(1.6, dx)) * 10;
      targetX = Math.max(-1.6, Math.min(1.6, dy)) * -10;
      queueTilt();
    }, { passive: true });
  }

  atomCore?.addEventListener('pointerenter', () => {
    atomCore.classList.remove('is-pulsing');
    void atomCore.offsetWidth;
    atomCore.classList.add('is-pulsing');
  });

  /* ----- G-ORB!T feature lab ----- */

  const features = [
    {
      kicker: 'Front architecture', title: 'Parabolic ogive nose cone', mark: 'motion-swoosh',
      tags: ['Aerodynamics', 'CFD reviewed', 'Smoke tunnel', 'Foam machined'],
      copy: [
        'The nose is the first surface the air meets, so its job is to set the tone for everything downstream. G-ORB!T uses a parabolic ogive profile: a curve that starts sharp and opens progressively, guiding air around the body without the sudden changes in direction that cause flow to separate and drag to climb.',
        'The profile was developed against the competition regulations first, then refined through repeated CAD passes and compared in CFD and smoke-tunnel observation. Work with BITS Pilani Formula Bharat brought ANSYS-based insight into how the nose and floor behave together rather than as two separate problems.',
        'Because the body is machined from polyurethane foam, every curve also has to survive the cutter and the finishing process. The final geometry is the one that stayed smooth on the bench as well as in the simulation.'
      ]
    },
    {
      kicker: 'Protective structure', title: 'Improved Halo Node', mark: 'icon-n',
      tags: ['Structure', 'Translucent PLA', 'Resin trials', 'Identity'],
      copy: [
        'The Halo is a required protective element, but on G-ORB!T it is treated as a designed part rather than a bolt-on. Its geometry, material and finish were developed together so that it adds protection and identity without adding unnecessary mass or disturbing the airflow over the cockpit.',
        'The team compared translucent PLA prints with heavier resin trials, weighing surface quality against weight and fit. Each candidate went through finishing and assembly reviews before a direction was chosen.',
        'The result is a Halo Node that sits cleanly in the body, matches the visual language of the car and can be reproduced consistently from one build to the next.'
      ]
    },
    {
      kicker: 'Rotating system', title: 'Triple-spoke wheels', mark: 'icon-orbit',
      tags: ['Wheels', 'Bearings', 'SLS / MJF', 'PA12 Nylon'],
      copy: [
        'Wheels are where energy is lost or kept, so G-ORB!T moves to a new triple-spoke architecture developed as a complete rotating system: spoke geometry, hub fit, bearing selection and manufacturing method reviewed in one pass instead of in isolation.',
        'Three spokes reduce rotating mass while keeping the rim stiff and true. Bearing seats were modelled to the tolerances that PA12 Nylon can hold through SLS and MJF processes, then checked with physical fit and rolling tests on in-house prototypes.',
        'Every iteration was judged on the same question: does the wheel spin freely, run straight and survive repeated launches without changing its behaviour?'
      ]
    },
    {
      kicker: 'Body transition', title: 'Redesigned split sides', mark: 'motion-z',
      tags: ['Aerodynamics', 'Flow division', 'CAD iteration'],
      copy: [
        'Between the nose and the central body the air has to be divided and directed, and the split sides are where that decision is made. G-ORB!T reworks these surfaces so the flow is separated deliberately, with each stream given a clear path along the car.',
        'The geometry was iterated in CAD and reviewed with the sidepods and underside, because a change at the split alters what arrives at every surface behind it. The team used CFD comparison to see where flow stayed attached and where it broke away.',
        'The aim is a body that reads as one continuous shape from the front, with transitions that are felt by the air but not fought against.'
      ]
    },
    {
      kicker: 'Side profile', title: 'Extended convex sidepods', mark: 'motion-speed',
      tags: ['Aerodynamics', 'Side flow', 'Regulation aware'],
      copy: [
        'The sidepods on G-ORB!T are longer and more convex than on ORB!TUS, creating a gentler, more deliberate transition along the length of the car. Convex surfaces keep air attached over a longer distance, which helps the flow reach the rear of the car in a calmer state.',
        'Their shape was developed as part of the wider airflow system rather than as a styling feature, with regulation limits on width and profile checked at every stage of the CAD work.',
        'Longer surfaces also demand more careful finishing, so the manufacturing plan for the foam body was updated alongside the design.'
      ]
    },
    {
      kicker: 'Underbody', title: 'Streamlined underside', mark: 'motion-swoosh',
      tags: ['Underbody', 'ANSYS insight', 'Design for manufacture'],
      copy: [
        'The underside of a car is easy to ignore and expensive to get wrong. G-ORB!T treats the lower surface as an active aerodynamic region, with geometry designed for continuity from the nose to the tail rather than as the leftover space between components.',
        'Testing conversations with BITS Pilani Formula Bharat brought ANSYS-based insight into how the floor and nose interact, informing where the surface could be smoothed and where clearance had to be preserved.',
        'Every decision was checked against practical manufacture, so the final floor can be machined, finished and mounted without compromising the profile the simulation was built around.'
      ]
    },
    {
      kicker: 'Flow management', title: 'Side cut-outs', mark: 'icon-flag',
      tags: ['Flow management', 'Local openings', 'System review'],
      copy: [
        'Rather than treating openings as decoration, G-ORB!T uses purposeful side cut-outs to explore how local openings can manage air around the side structure. Each cut-out has a job: relieving pressure, guiding flow or reducing surface area in a region that was not contributing.',
        'Because a cut-out changes the flow arriving at the surfaces behind it, the openings were reviewed as part of the same system as the split sides, sidepods and rear wing rather than as isolated features.',
        'Their size and position continue to be refined as new test observations come in.'
      ]
    },
    {
      kicker: 'Rear aero concept', title: 'Bach wing development', mark: 'motion-z',
      tags: ['Rear wing', 'Active evaluation', 'CFD comparison'],
      copy: [
        'The rear wing is the last surface the air sees, and it can only work with the flow the rest of the car delivers to it. The Bach wing is G-ORB!T’s developing rear-aero concept, under active evaluation as the team studies how air leaves the body and side systems.',
        'Several wing profiles are being compared in CFD and against smoke-tunnel observation, with attention to how the wing behaves during the launch and the run rather than only at a single steady speed.',
        'It remains a concept in development, which is exactly the point: the design stays open until the evidence closes it.'
      ]
    },
    {
      kicker: 'Integrated development', title: 'Research to manufacture', mark: 'icon-star',
      tags: ['Process', 'CFD', 'Smoke tunnel', 'Bambu Lab P1S', 'Stemplify', 'Fusion IIID'],
      copy: [
        'G-ORB!T is developed as one learning loop. Aerodynamic research feeds CAD review, CAD feeds CFD comparison and smoke-tunnel observation, and every conclusion is checked against a physical part before it is trusted.',
        'In-house prototyping on the Bambu Lab P1S accelerates fit checks, while specialist partners such as Stemplify India and Fusion IIID take final components through SLS, MJF and foam machining. Testing collaboration with BITS Pilani Formula Bharat and industry guidance widen what a student team can verify.',
        'Nothing on the car is finished until it has been questioned, modelled, tested, made and reviewed, and every part is ready to go around the loop again.'
      ]
    }
  ];

  const featureButtons = $$('[data-feature]');
  const featureCopy = $('.feature-lab__copy');
  const featureKicker = $('#feature-kicker');
  const featureTitle = $('#feature-title');
  const featureText = $('#feature-copy');
  const featureIndex = $('#feature-index');
  const featureMeter = $('#feature-meter');
  const featureTags = $('#feature-tags');
  const featureMark = $('#feature-mark');

  const selectFeature = (index, focus = false) => {
    const feature = features[index];
    if (!feature || !featureCopy) return;
    featureButtons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === index;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    featureKicker.textContent = feature.kicker;
    featureTitle.textContent = feature.title;
    featureText.replaceChildren(...feature.copy.map((paragraph) => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      return p;
    }));
    if (featureTags) {
      featureTags.replaceChildren(...feature.tags.map((tag) => {
        const li = document.createElement('li');
        li.textContent = tag;
        return li;
      }));
    }
    if (featureMark) {
      featureMark.src = `assets/marks/${feature.mark}.png`;
      featureMark.classList.remove('is-changing');
      void featureMark.offsetWidth;
      featureMark.classList.add('is-changing');
    }
    featureIndex.textContent = `${String(index + 1).padStart(2, '0')} / ${String(features.length).padStart(2, '0')}`;
    featureMeter.style.width = `${((index + 1) / features.length) * 100}%`;
    featureCopy.classList.remove('is-changing');
    void featureCopy.offsetWidth;
    featureCopy.classList.add('is-changing');
    if (focus) featureButtons[index].focus();
  };

  featureButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectFeature(index));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % featureButtons.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + featureButtons.length) % featureButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = featureButtons.length - 1;
      selectFeature(next, true);
    });
  });
  if (featureButtons.length) selectFeature(0);

  /* ----- engineering tabs ----- */

  const engineeringTabs = $$('[data-eng-tab]');
  const engineeringPanels = $$('[data-eng-panel]');

  const selectEngineeringTab = (id, focus = false) => {
    engineeringTabs.forEach((tab) => {
      const selected = tab.dataset.engTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    engineeringPanels.forEach((panel) => {
      const selected = panel.dataset.engPanel === id;
      panel.hidden = !selected;
      if (selected) {
        panel.classList.remove('is-entering');
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      }
    });
  };

  engineeringTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectEngineeringTab(tab.dataset.engTab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % engineeringTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + engineeringTabs.length) % engineeringTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = engineeringTabs.length - 1;
      selectEngineeringTab(engineeringTabs[next].dataset.engTab, true);
    });
  });
  if (engineeringTabs.length) selectEngineeringTab('aero');

  /* ----- result counters ----- */

  const counters = $$('[data-counter]');
  const animateCounter = (counter) => {
    const target = Number(counter.dataset.counter);
    if (prefersReducedMotion.matches || root.classList.contains('reduced-effects')) {
      counter.textContent = target;
      return;
    }
    const start = performance.now();
    const duration = 1200;
    const tick = (now) => {
      const progressValue = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progressValue, 3);
      counter.textContent = Math.round(target * eased);
      if (progressValue < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.55 });
    counters.forEach((counter) => counterObserver.observe(counter));
  } else {
    counters.forEach(animateCounter);
  }

  /* ----- media index: filters + lightbox ----- */

  const filterButtons = $$('.media-filters [data-filter]');
  const mediaCards = $$('.media-card');
  const mediaEmpty = $('#media-empty');

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      let visibleCount = 0;
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      mediaCards.forEach((card) => {
        const visible = filter === 'all' || card.dataset.category === filter;
        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      if (mediaEmpty) mediaEmpty.hidden = visibleCount !== 0;
    });
  });

  const mediaDialog = $('#media-dialog');
  const mediaDialogTitle = $('#media-dialog-title');
  const mediaDialogCopy = $('#media-dialog-copy');
  const mediaDialogVisual = $('#media-dialog-visual');

  const showDialog = (dialog) => {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  const closeDialog = (dialog) => {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  mediaCards.forEach((card) => {
    card.addEventListener('click', () => {
      mediaDialogTitle.textContent = card.dataset.mediaTitle;
      mediaDialogCopy.textContent = card.dataset.mediaCopy;
      mediaDialogVisual.replaceChildren();
      const sourceImage = card.querySelector('img');
      if (sourceImage) {
        const image = document.createElement('img');
        image.src = sourceImage.currentSrc || sourceImage.src;
        image.alt = sourceImage.alt;
        image.width = 1536;
        image.height = 1024;
        mediaDialogVisual.append(image);
        mediaDialogVisual.hidden = false;
      } else {
        mediaDialogVisual.hidden = true;
      }
      showDialog(mediaDialog);
    });
  });

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
  });

  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeDialog(dialog);
    });
  });

  /* ----- contact form (localhost demonstration mode) ----- */

  const form = $('#contact-form');
  const formStatus = $('#form-status');

  if (form && formStatus) {
    const formFields = $$('input, select, textarea', form);

    formFields.forEach((field) => {
      field.addEventListener('input', () => {
        field.removeAttribute('aria-invalid');
        formStatus.textContent = '';
        formStatus.classList.remove('is-ok', 'is-error');
      });
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const invalid = formFields.filter((field) => !field.validity.valid);
      formFields.forEach((field) => field.toggleAttribute('aria-invalid', !field.validity.valid));
      formStatus.classList.remove('is-ok', 'is-error');
      if (invalid.length) {
        formStatus.textContent = 'Please complete the required fields with a valid email and message.';
        formStatus.classList.add('is-error');
        invalid[0].focus();
        return;
      }
      formStatus.textContent = 'Validated successfully. This localhost demo did not send your message.';
      formStatus.classList.add('is-ok');
      form.reset();
      formFields.forEach((field) => field.removeAttribute('aria-invalid'));
    });
  }

  /* ----- fortune cookie: quote of the day ----- */

  const fortunes = [
    ['Speed begins with a better question.', 'Curiosity'],
    ['The cleanest line is found one iteration at a time.', 'Iteration'],
    ['Precision is teamwork made visible.', 'Teamwork'],
    ['Test the idea. Keep the learning.', 'Engineering'],
    ['A setback is data with sharp edges.', 'Resilience'],
    ['Ambition moves faster when every role connects.', 'Unity'],
    ['Build for the track. Learn for everywhere.', 'Growth'],
    ['Small refinements create serious momentum.', 'Progress'],
    ['The next breakthrough may be hiding in the transition.', 'Innovation'],
    ['Make the invisible forces part of the conversation.', 'Aerodynamics'],
    ['Clarity reduces more drag than confidence alone.', 'Focus'],
    ['A strong team shares the credit and the problem.', 'Collaboration']
  ];

  const dateKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fortuneIndex = [...dateKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) % fortunes.length;

  const fortuneCookie = $('#fortune-cookie');
  const fortuneDialog = $('#fortune-dialog');
  const fortuneTitle = $('#fortune-title');
  const fortuneTheme = $('#fortune-theme');
  const fortuneReset = $('#fortune-reset');
  const soundToggle = $('#sound-toggle');
  let soundEnabled = false;

  const playCrack = () => {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(190, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(62, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener('ended', () => context.close());
  };

  fortuneCookie?.addEventListener('click', () => {
    fortuneCookie.classList.add('is-cracked');
    playCrack();
    fortuneTitle.textContent = `\u201C${fortunes[fortuneIndex][0]}\u201D`;
    fortuneTheme.textContent = `Today\u2019s theme: ${fortunes[fortuneIndex][1]}`;
    const delay = root.classList.contains('reduced-effects') || prefersReducedMotion.matches ? 0 : 560;
    window.setTimeout(() => showDialog(fortuneDialog), delay);
  });

  fortuneReset?.addEventListener('click', () => {
    closeDialog(fortuneDialog);
    fortuneCookie.classList.remove('is-cracked');
    fortuneCookie.focus();
  });

  fortuneDialog?.addEventListener('close', () => {
    fortuneCookie?.classList.remove('is-cracked');
  });

  soundToggle?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    if (soundEnabled) playCrack();
  });

  /* ----- the secret "!": N!TRO mission ----- */

  const missionTrigger = $('#mission-trigger');
  const missionPanel = $('#mission-panel');

  const closeMission = () => {
    if (!missionPanel || missionPanel.hidden) return;
    missionPanel.hidden = true;
    missionTrigger.setAttribute('aria-expanded', 'false');
  };

  missionTrigger?.addEventListener('click', () => {
    const open = missionPanel.hidden;
    missionPanel.hidden = !open;
    missionTrigger.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (missionPanel && !missionPanel.hidden && !missionPanel.contains(event.target) && event.target !== missionTrigger && !missionTrigger.contains(event.target)) {
      closeMission();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMission();
  });

  /* ----- effects toggle ----- */

  const effectsToggle = $('#effects-toggle');

  const setReducedEffects = (reduced) => {
    root.classList.toggle('reduced-effects', reduced);
    if (effectsToggle) {
      effectsToggle.setAttribute('aria-pressed', String(reduced));
      effectsToggle.textContent = reduced ? 'Restore effects' : 'Reduce effects';
    }
    if (reduced) revealItems.forEach((item) => item.classList.add('is-visible'));
    storage.set('nitro-reduced-effects', String(reduced));
  };

  if (reducedEffectsSaved) setReducedEffects(true);
  effectsToggle?.addEventListener('click', () => setReducedEffects(!root.classList.contains('reduced-effects')));
})();
