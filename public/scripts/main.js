/**
 * Portfolio v2 — Client-side runtime
 *
 * Handles: dark mode toggle, smooth scrolling, navbar behavior.
 * Deliberately NOT handled here (design decisions): scroll reveals
 * (content is visible by default), card tilt (removed with card glow),
 * Lord icon pulse animations (icons render static).
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
  // Lord Icon theme colors — icons ship SSR'd with light-theme colors;
  // re-tint once on load so dark mode doesn't render them faded, and
  // again on every theme change (setTheme above).
  //────────────────────────────────────────────────────────────────────────────
  function applyIconColorsWhenReady() {
    updateIconColors(getIconColors());
  }

  var colorsApplied = false;
  function applyIconColorsOnce() {
    if (colorsApplied) return;
    colorsApplied = true;
    applyIconColorsWhenReady();
  }

  if (window.customElements) {
    try {
      customElements.whenDefined('lord-icon').then(applyIconColorsOnce);
    } catch (_) {
      applyIconColorsOnce();
    }
    // Safety net if the CDN is blocked or whenDefined stalls
    setTimeout(applyIconColorsOnce, 3000);
  } else {
    applyIconColorsOnce();
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
  // Bootstrap
  //────────────────────────────────────────────────────────────────────────────
})();
