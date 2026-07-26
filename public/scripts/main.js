/**
 * Portfolio v2 — Client-side runtime
 *
 * Handles: scroll reveals, dark mode toggle, Lord Icon system, card tilt,
 * smooth scrolling.
 * Loaded via <script defer> from BaseLayout — DOM is already parsed by the
 * time this runs, so we can kick off immediately.
 */

//────────────────────────────────────────────────────────────────────────────
// Shared smooth scroll — cubic ease-out, accounts for fixed navbar
// Accepts an HTMLElement (scrolls to it) or a number (scrolls to that Y pos)
//────────────────────────────────────────────────────────────────────────────
function scrollToTarget(target) {
  var navbarH = 64;
  var targetY =
    typeof target === 'number'
      ? target
      : target.getBoundingClientRect().top + window.scrollY - navbarH - 12;
  var startY = window.scrollY;
  var distance = targetY - startY;
  var duration = 480;
  var startTime = performance.now();

  function step(now) {
    var elapsed = now - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    window.scrollTo(0, startY + distance * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

(function () {
  //────────────────────────────────────────────────────────────────────────────
  // Scroll reveal observer — runs immediately (DOM is ready when defer fires)
  //────────────────────────────────────────────────────────────────────────────
  var revealEls = document.querySelectorAll('.reveal');
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

  function updateIconColors(colorsOverride) {
    var colors = colorsOverride || getIconColors();
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
    var colors = getIconColors();
    updateIconColors(colors);
    animateToggleIcons();
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
    var BUFFER = 10; // px beyond card edge before tilt resets

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
        var docMoveBound = null;

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

        function deactivate() {
          active = false;
          targetX = 0;
          targetY = 0;
          if (docMoveBound) {
            document.removeEventListener('mousemove', docMoveBound);
            docMoveBound = null;
          }
        }

        function isInsideBuffer(e) {
          var rect = el.getBoundingClientRect();
          return (
            e.clientX >= rect.left - BUFFER &&
            e.clientX <= rect.right + BUFFER &&
            e.clientY >= rect.top - BUFFER &&
            e.clientY <= rect.bottom + BUFFER
          );
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

          // Track mouse globally so we can detect when it leaves the buffer zone
          if (!docMoveBound) {
            docMoveBound = function (e) {
              if (!isInsideBuffer(e)) {
                deactivate();
              }
            };
            document.addEventListener('mousemove', docMoveBound);
          }
        });

        el.addEventListener('mousemove', setTarget);

        // Fallback: if the card is removed from DOM or scrolled away,
        // the document listener will still catch the exit
        el.addEventListener('mouseleave', function () {
          // Don't reset immediately — let the buffer check handle it.
          // If the mouse truly left the area, docMoveBound will deactivate.
        });
      })(cards[c]);
    }
  }

  //────────────────────────────────────────────────────────────────────────────
  // Navbar — scroll class, mobile menu, smooth scroll, active-section underline
  //────────────────────────────────────────────────────────────────────────────
  var navbar = document.getElementById('navbar');
  if (navbar) {
    var scrollClasses = [
      'bg-surface/90',
      'backdrop-blur-lg',
      'border-b',
      'border-border/50',
      'shadow-[0_1px_3px_rgba(0,0,0,0.05)]',
    ];
    function updateNavbar() {
      if (window.scrollY > 50) {
        navbar.classList.add.apply(navbar.classList, scrollClasses);
      } else {
        navbar.classList.remove.apply(navbar.classList, scrollClasses);
      }
    }
    updateNavbar();
    window.addEventListener('scroll', updateNavbar);
  }

  var btn = document.getElementById('mobile-menu-btn');
  var menu = document.getElementById('mobile-menu');
  var bar1 = document.getElementById('bar1');
  var bar2 = document.getElementById('bar2');
  var bar3 = document.getElementById('bar3');

  if (btn && menu) {
    btn.addEventListener('click', function () {
      var isOpen = !menu.classList.contains('hidden');
      menu.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        if (bar1) bar1.classList.add('rotate-45', 'translate-y-[8px]');
        if (bar2) bar2.classList.add('opacity-0');
        if (bar3) bar3.classList.add('-rotate-45', '-translate-y-[8px]');
      } else {
        if (bar1) bar1.classList.remove('rotate-45', 'translate-y-[8px]');
        if (bar2) bar2.classList.remove('opacity-0');
        if (bar3) bar3.classList.remove('-rotate-45', '-translate-y-[8px]');
      }
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        if (bar1) bar1.classList.remove('rotate-45', 'translate-y-[8px]');
        if (bar2) bar2.classList.remove('opacity-0');
        if (bar3) bar3.classList.remove('-rotate-45', '-translate-y-[8px]');
      });
    });
  }

  var isHome = window.location.pathname === '/' || window.location.pathname === '';

  document.querySelectorAll('.nav-link[data-section]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var el = this;
      var hash = '#' + el.dataset.section;
      if (isHome) {
        e.preventDefault();
        var target = document.querySelector(hash);
        if (target) scrollToTarget(target);
      }
    });
  });

  document.querySelectorAll('#mobile-menu a[href*="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var el = this;
      var href = el.getAttribute('href');
      var hash = href.indexOf('#') !== -1 ? '#' + href.split('#')[1] : '';
      if (isHome && hash) {
        e.preventDefault();
        var target = document.querySelector(hash);
        if (target) scrollToTarget(target);
      }
    });
  });

  if (isHome) {
    var underline = document.getElementById('nav-underline');
    var navLinksContainer = document.getElementById('nav-links');
    if (underline && navLinksContainer) {
      var sectionLinks = navLinksContainer.querySelectorAll('.nav-link[data-section]');
      var sectionIds = Array.from(sectionLinks).map(function (l) {
        return l.dataset.section;
      });
      var sections = sectionIds
        .map(function (id) {
          return document.getElementById(id);
        })
        .filter(Boolean);

      if (sections.length > 0) {
        var activeId = null;
        var ratios = new Map();

        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              ratios.set(entry.target.id, entry.intersectionRatio);
            });
            var best = null;
            var bestRatio = 0;
            ratios.forEach(function (ratio, id) {
              if (ratio > bestRatio) {
                best = id;
                bestRatio = ratio;
              }
            });
            if (bestRatio === 0) best = null;
            activeId = best;
          },
          { rootMargin: '-80px 0px -70% 0px', threshold: [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1] },
        );

        sections.forEach(function (section) {
          observer.observe(section);
        });

        var curLeft = 0;
        var curWidth = 0;
        var curOpacity = 0;

        function lerp() {
          var link = activeId
            ? navLinksContainer.querySelector('.nav-link[data-section="' + activeId + '"]')
            : null;

          var targetLeft = 0;
          var targetWidth = 0;
          var targetOpacity = 0;

          if (link) {
            var ulRect = navLinksContainer.getBoundingClientRect();
            var linkRect = link.getBoundingClientRect();
            targetLeft = linkRect.left - ulRect.left;
            targetWidth = linkRect.width;
            targetOpacity = 1;
          }

          var speed = 0.18;
          curLeft += (targetLeft - curLeft) * speed;
          curWidth += (targetWidth - curWidth) * speed;
          curOpacity += (targetOpacity - curOpacity) * speed;

          underline.style.transform = 'translateX(' + curLeft + 'px)';
          underline.style.width = curWidth + 'px';
          underline.style.opacity = String(curOpacity);

          requestAnimationFrame(lerp);
        }

        requestAnimationFrame(lerp);
      }
    }
  }


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
