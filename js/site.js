(function () {
  var _transparentHeader = false;
  var _isMenuOpen = false;

  var NAV_LINKS = [
    { label: "Home",     val: "home",     file: "/" },
    { label: "Packages", val: "packages", file: "/packages/" },
    { label: "Business", val: "business", file: "/business/" },
    { label: "About",    val: "about",    file: "/about/" },
    { label: "Articles", val: "articles", file: "/articles/" },
    { label: "Reading",  val: "reading",  file: "/reading/" },
  ];

  /* ─── Header scroll behaviour ─── */
  function _handleScroll() {
    var header = document.getElementById("main-header");
    if (!header) return;
    var isScrolled = window.scrollY > 20;
    if (isScrolled || _isMenuOpen) {
      header.classList.add("header-scrolled");
      header.classList.add("py-4");
      header.classList.remove("py-6");
    } else if (_transparentHeader) {
      header.classList.remove("header-scrolled");
      header.classList.remove("py-4");
      header.classList.add("py-6");
    }
  }

  /* ─── Nav render ─── */
  function _renderNav(activeVal) {
    var desktop = document.getElementById("desktop-nav-links");
    var mobile  = document.getElementById("mobile-nav-links");
    if (!desktop || !mobile) return;
    NAV_LINKS.forEach(function (link) {
      var isActive = link.val === activeVal;
      /* desktop */
      var btn = document.createElement("button");
      btn.className = "nav-link-btn text-xs font-bold uppercase tracking-widest transition-all duration-300 hover:text-brand-accent relative group cursor-pointer "
        + (isActive ? "text-brand-accent" : "text-slate-600");
      btn.dataset.val = link.val;
      btn.onclick = function () { window.location.href = link.file; };
      btn.innerHTML = link.label
        + '<span class="absolute -bottom-2 left-0 h-0.5 bg-brand-accent transition-all duration-300 group-hover:w-full '
        + (isActive ? 'w-full' : 'w-0')
        + '"></span>';
      desktop.appendChild(btn);
      /* mobile */
      var mBtn = document.createElement("button");
      mBtn.className = "text-2xl font-serif transition-colors cursor-pointer "
        + (isActive ? "text-brand-accent" : "text-brand-dark hover:text-brand-accent");
      mBtn.onclick = function () { window.location.href = link.file; };
      mBtn.innerText = link.label;
      mobile.appendChild(mBtn);
    });
  }

  /* ─── Mobile menu ─── */
  window.toggleMobileMenu = function () {
    _isMenuOpen = !_isMenuOpen;
    var menu     = document.getElementById("mobile-menu");
    var iconEl   = document.getElementById("menu-icon");
    if (!menu) return;
    menu.classList.toggle("translate-x-full", !_isMenuOpen);
    menu.classList.toggle("translate-x-0",    _isMenuOpen);
    if (iconEl) {
      iconEl.setAttribute("data-lucide", _isMenuOpen ? "x" : "menu");
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
    _handleScroll();
  };

  /* ─── Public init ─── */
  window.initSiteNav = function (activeVal, transparentHeader) {
    _transparentHeader = !!transparentHeader;
    var desktop = document.getElementById("desktop-nav-links");
    var mobile  = document.getElementById("mobile-nav-links");
    if (!desktop || desktop.children.length === 0 || !mobile || mobile.children.length === 0) {
      _renderNav(activeVal || "");
    }
    window.addEventListener("scroll", _handleScroll, { passive: true });
    _handleScroll();
  };

  window.initLucide = function () {
    if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
  };

  /* ─── Hero accent bar: hide when headline overlaps ─── */
  window.initHeroAccentBar = function () {
    var bar      = document.getElementById("hero-accent-bar");
    var headline = document.getElementById("hero-headline");
    if (!bar || !headline) return;
    function check() {
      requestAnimationFrame(function () {
        var hRect = headline.getBoundingClientRect();
        var bRect = bar.getBoundingClientRect();
        /* bRect.left is 0 when bar is display:none (mobile) — skip */
        if (bRect.left === 0 && bRect.width === 0) return;
        bar.style.opacity = hRect.right > bRect.left ? "0" : "";
      });
    }
    check();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(check);
    }
    window.addEventListener("resize", check, { passive: true });
  };

  /* ─── Scroll progress bar ─── */
  window.initScrollProgress = function () {
    var bar = document.getElementById("scroll-progress");
    if (!bar) return;
    window.addEventListener("scroll", function () {
      var scrollTop  = window.scrollY;
      var docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (docHeight > 0 ? (scrollTop / docHeight) * 100 : 0) + "%";
    }, { passive: true });
  };

  /* ─── Scroll reveal ─── */
  window.initScrollReveal = function () {
    var els = document.querySelectorAll(".reveal, .reveal-left, .reveal-right");
    if (!els.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
    els.forEach(function (el) { obs.observe(el); });
  };

  /* ─── Animated counters ─── */
  window.initCounters = function () {
    var counters = document.querySelectorAll("[data-counter]");
    if (!counters.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var target   = parseInt(e.target.dataset.counter, 10);
        var duration = 2200;
        var startTime = null;
        var step = function (ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var ease     = 1 - Math.pow(1 - progress, 3);
          e.target.textContent = Math.floor(ease * target).toLocaleString();
          if (progress < 1) requestAnimationFrame(step);
          else e.target.textContent = target.toLocaleString();
        };
        requestAnimationFrame(step);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { obs.observe(el); });
  };

})();
