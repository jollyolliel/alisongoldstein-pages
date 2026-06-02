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

  window.SITE_ARTICLES = [
    { id: "6", title: "Network With Purpose", category: "Leadership", date: "November 28, 2025", author: "Alison Goldstein", image: "/images/achievement-agreement-arms.webp", excerpt: "Tips to network with intention rather than chance. By getting clear on what you want from each connection and understanding the roles people can play in your growth, you can build relationships that create opportunity, visibility, and momentum in your career." },
    { id: "5", title: "From Presentation to Impact", category: "Executive Presence", date: "November 28, 2025", author: "Alison Goldstein", image: "/images/close-up-young-colleagues-having-meeting.webp", excerpt: "Tips to transform routine meetings into strategic moments of influence. By shifting focus beyond the deck itself and defining success for everyone involved, leaders can strengthen alignment, build trust, and drive meaningful outcomes long after the presentation ends." },
    { id: "1", title: "3 Tools Every Working Parent Needs", category: "Productivity", date: "October 12, 2023", author: "Alison Goldstein", image: "/images/photo-1454165804606-c3d57bc86b40.webp", excerpt: "Tips to better manage stress levels when working from home during challenging times. With widespread mandates for all non-essential employees..." },
    { id: "2", title: "8 Steps to Living Your Family Dream", category: "Lifestyle", date: "September 28, 2023", author: "Alison Goldstein", image: "/images/photo-1511895426328-dc8714191300.webp", excerpt: "My journey from talking about traveling the world to booking the flights. For those of you in the corporate world, you're likely familiar with the feeling..." },
    { id: "3", title: "Top 10 Tips for Expats: How to Thrive", category: "Expat Life", date: "August 15, 2023", author: "Alison Goldstein", image: "/images/photo-1529156069898-49953e39b3ac.webp", excerpt: "Whether this is your first international move, or like me, your seventh, I guarantee that you know everything you need to know to do more than just survive." },
    { id: "4", title: "Secret: Even Coaches Get Coached", category: "Professional Development", date: "July 02, 2023", author: "Alison Goldstein", image: "/images/photo-1556761175-5973dc0f32e7.webp", excerpt: 'The Team That Helped Me Run 42 km. This past summer, I started tossing around the idea of doing the Athens "Authentic" marathon.' },
  ];

  window.SITE_TESTIMONIALS = [
    { quote: "I all but begged my company to extend my contract to keep working with her.", author: "Harolyn A.", role: "Managing Vice President" },
    { quote: "Through her amazing listening and coaching skills Alie helped me regain self confidence in my ability but also in my approach to balancing family and work.", author: "Paula B.", role: "Senior Partner" },
    { quote: "Alie would push me to find ways to hold myself accountable to accomplish the goals I deemed important.", author: "Matt B.", role: "Sr. Director" },
    { quote: "You helped me find common ground with my toughest negotiators, the kids, and helped me navigate difficult conversations at work with grace and kindness.", author: "Rakhi J.", role: "VP Employment Law" },
    { quote: "Each time we met I had a fruitful career conversation and an action plan developed by the time we ended the conversation.", author: "Paul B.", role: "Technical Leader" },
    { quote: "I have made more progress toward my personal and professional goals in that short time than I have in years.", author: "Kristen L.", role: "Banking Professional" },
    { quote: "She has taught me valuable strategies to improve communication, how to set realistic expectations and boundaries, and the importance values play in all relationships.", author: "Carmen M.", role: "Global Compensation Leader" },
    { quote: "She also helped me make concrete action plans that I had to do every week, increasing my sense of achievement and progress, all of it in a judgement free environment.", author: "Anneli S.", role: "HSEQ Professional" },
    { quote: "She is a compassionate coach, creative and always guides me to finding solutions from within.", author: "Natalia C.", role: "Director, Legal" },
    { quote: "Working with her as my coach helped me to achieve things I could not have done on my own.", author: "James C.", role: "Executive Coaching Client" },
    { quote: "Her ability to really hear what I had to say and to provide activities and materials that were extremely relevant to the goals I set, made it easy to stay focused and on-track.", author: "Tonya T.", role: "Workplace Leader" },
    { quote: "I would recommend Alison without hesitation to anyone interested in becoming a better leader.", author: "Ludovico M.", role: "Chief Strategy Officer" },
    { quote: "I have been more courageous, accomplished goals that I did not think were possible for me, and had difficult conversations that I normally would avoid with great ease and success.", author: "Norah L.", role: "Global Account Lead" },
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

  /* ─── Shared article card template ─── */
  window.articleCard = function (article) {
    return '<div onclick="window.location.href=\'/article-' + article.id + '/\'" class="group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-400 flex flex-col h-full border border-slate-100 hover:border-brand-accent/20">'
      + '<div class="h-52 overflow-hidden relative">'
      + '<img src="' + article.image + '" alt="' + article.title + '" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />'
      + '<div class="absolute inset-0 bg-gradient-to-t from-brand-dark/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>'
      + '<div class="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-accent rounded-sm">' + article.category + '</div>'
      + '</div>'
      + '<div class="p-7 flex flex-col flex-grow">'
      + '<div class="text-slate-400 text-xs flex items-center mb-3"><i data-lucide="calendar" class="w-3 h-3 mr-1.5"></i>' + article.date + '</div>'
      + '<h3 class="font-serif text-xl text-brand-dark mb-3 leading-snug group-hover:text-brand-accent transition-colors duration-200">' + article.title + '</h3>'
      + '<p class="text-slate-500 text-sm leading-relaxed line-clamp-3 mb-5 flex-grow">' + article.excerpt + '</p>'
      + '<span class="text-brand-dark text-xs font-bold uppercase tracking-wider flex items-center gap-2 group-hover:text-brand-accent transition-colors">'
      + 'Read Article <i data-lucide="arrow-right" class="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200"></i>'
      + '</span>'
      + '</div></div>';
  };

})();
