/**
 * Portfolio v2 — Client-side runtime
 *
 * Handles: scroll reveals, dark mode toggle, Lord Icon system, card tilt.
 * Loaded via <script defer> from BaseLayout — DOM is already parsed by the
 * time this runs, so we can kick off immediately.
 */
(function () {
  //────────────────────────────────────────────────────────────────────────────
  // Scroll reveal observer — runs immediately (DOM is ready when defer fires)
  //────────────────────────────────────────────────────────────────────────────
  var revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
  if (revealEls.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );

    for (var r = 0; r < revealEls.length; r++) {
      revealObserver.observe(revealEls[r]);
    }
  }

  //────────────────────────────────────────────────────────────────────────────
  // Dark mode helpers
  //────────────────────────────────────────────────────────────────────────────
  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function getIconColors() {
    var style = getComputedStyle(document.documentElement);
    var primary = style.getPropertyValue('--color-ink').trim();
    var secondary = style.getPropertyValue('--color-accent').trim();
    return 'primary:' + primary + ',secondary:' + secondary;
  }

  function updateIconColors() {
    var colors = getIconColors();
    var icons = document.querySelectorAll('lord-icon');
    for (var i = 0; i < icons.length; i++) {
      var current = icons[i].getAttribute('colors') || '';
      if (current.indexOf('#ffffff') !== -1) continue;
      icons[i].setAttribute('colors', colors);
    }
  }

  function animateToggleIcons() {
    var svgs = document.querySelectorAll('#theme-toggle svg, #theme-toggle-mobile svg');
    for (var i = 0; i < svgs.length; i++) {
      if (getComputedStyle(svgs[i]).display !== 'none') {
        svgs[i].classList.remove('theme-icon-enter');
        void svgs[i].offsetWidth;
        svgs[i].classList.add('theme-icon-enter');
      }
    }
  }

  function setTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    updateIconColors();
    animateToggleIcons();

    var expandBtn = document.getElementById('projects-expand-btn');
    if (expandBtn) {
      var colors = getIconColors();
      var btnIcons = expandBtn.querySelectorAll('lord-icon');
      for (var i = 0; i < btnIcons.length; i++) {
        btnIcons[i].setAttribute('colors', colors);
      }
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#theme-toggle, #theme-toggle-mobile');
    if (btn) setTheme(!isDark());
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) setTheme(e.matches);
  });

  //────────────────────────────────────────────────────────────────────────────
  // Lord Icon animation system
  //────────────────────────────────────────────────────────────────────────────
  function playIcon(icon) {
    if (icon.playerInstance) {
      icon.playerInstance.playFromBeginning();
      icon.classList.remove('icon-animate');
      void icon.offsetWidth;
      icon.classList.add('icon-animate');
    }
  }

  var readyIcons = new Set();

  function onIconReady(icon, callback) {
    if (icon.playerInstance) {
      readyIcons.add(icon);
      callback();
    } else {
      icon.addEventListener('ready', function () {
        readyIcons.add(icon);
        callback();
      });
    }
  }

  var INTERACTIVE_PARENTS =
    'a, button, .card-glow, .bg-surface-raised, .bg-surface-sunken, .bg-accent-wash, #email-row, [class*="rounded-[6px]"]';

  function setupIcons() {
    var allIcons = document.querySelectorAll('lord-icon');

    updateIconColors();

    for (var i = 0; i < allIcons.length; i++) {
      (function (icon) {
        onIconReady(icon, function () {
          var parent = icon.closest(INTERACTIVE_PARENTS);
          if (parent && ['SECTION', 'NAV', 'FOOTER'].indexOf(parent.tagName) === -1) {
            parent.addEventListener('mouseenter', function () {
              playIcon(icon);
            });
          }
        });
      })(allIcons[i]);
    }

    var iconRevealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var icon = entry.target;
            if (readyIcons.has(icon)) {
              playIcon(icon);
            } else {
              onIconReady(icon, function () {
                playIcon(icon);
              });
            }
          }
        });
      },
      { threshold: 0.3 },
    );

    for (var j = 0; j < allIcons.length; j++) {
      iconRevealObserver.observe(allIcons[j]);
    }
  }

  //────────────────────────────────────────────────────────────────────────────
  // Card tilt effect (Balatro-style) — smooth lerp via rAF loop
  //────────────────────────────────────────────────────────────────────────────
  function initCardTilt() {
    var cards = document.querySelectorAll('.card-glow:not([data-tilt-bound])');
    var MAX_TILT = 8;
    var LERP = 0.16;

    for (var c = 0; c < cards.length; c++) {
      (function (card) {
        var el = card;
        el.setAttribute('data-tilt-bound', '');

        var targetX = 0,
          targetY = 0;
        var currentX = 0,
          currentY = 0;
        var active = false;
        var rafId = null;

        function loop() {
          currentX += (targetX - currentX) * LERP;
          currentY += (targetY - currentY) * LERP;

          if (active || Math.abs(currentX) > 0.03 || Math.abs(currentY) > 0.03) {
            var lift = active ? 'translateY(-4px) ' : '';
            el.style.transform =
              'perspective(800px) ' +
              lift +
              'rotateX(' +
              currentX +
              'deg) rotateY(' +
              currentY +
              'deg)';
            rafId = requestAnimationFrame(loop);
          } else {
            el.style.transform = '';
            rafId = null;
          }
        }

        function setTarget(e) {
          var rect = el.getBoundingClientRect();
          targetX = ((rect.height / 2 - (e.clientY - rect.top)) / (rect.height / 2)) * MAX_TILT;
          targetY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * MAX_TILT;
        }

        el.addEventListener('mouseenter', function (e) {
          active = true;
          setTarget(e);
          if (!rafId) rafId = requestAnimationFrame(loop);
        });

        el.addEventListener('mousemove', setTarget);

        el.addEventListener('mouseleave', function () {
          active = false;
          targetX = 0;
          targetY = 0;
        });
      })(cards[c]);
    }
  }

  window.initCardTilt = initCardTilt;

  //────────────────────────────────────────────────────────────────────────────
  // Bootstrap — run immediately (DOM is ready), icons wait for <lord-icon>
  //────────────────────────────────────────────────────────────────────────────
  initCardTilt();

  // Wait for Lord Icon custom element to be defined, with a generous fallback.
  // customElements.whenDefined is more reliable than a magic setTimeout.
  if (window.customElements) {
    var FALLBACK_MS = 3000;
    var started = false;

    function trySetupIcons() {
      if (started) return;
      started = true;
      setupIcons();
    }

    try {
      customElements.whenDefined('lord-icon').then(trySetupIcons);
    } catch (_) {
      trySetupIcons();
    }

    // Safety net: if whenDefined never resolves (e.g. CDN blocked), fire anyway
    setTimeout(function () {
      trySetupIcons();
    }, FALLBACK_MS);
  } else {
    // No customElements support — fire immediately, onIconReady handles the rest
    setupIcons();
  }
})();
