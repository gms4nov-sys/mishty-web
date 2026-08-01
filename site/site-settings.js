// Loads live settings (phone, email, address, logo, payment info) that were
// entered in the Admin Panel → Settings page, and applies them to this page.
// This lets a non-coder update contact/logo/payment info from the admin panel
// without ever editing these HTML files.
// Global lazy-loading — applies loading="lazy" to every <img> on the page
// (current and dynamically-injected) except the header/footer logo and the
// hero's own image, which are above the fold and should load immediately.
(function () {
  var EXCLUDE_IDS = ['siteLogoImg', 'footerLogoImg', 'heroFloatingImage'];
  function applyLazy(root) {
    (root || document).querySelectorAll('img:not([loading])').forEach(function (img) {
      if (EXCLUDE_IDS.indexOf(img.id) !== -1) return;
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
  }
  applyLazy();
  // Re-apply whenever admin-managed content (gallery, blog, testimonials,
  // client logos, etc.) is injected into the page after these initial fetches.
  var observer = new MutationObserver(function () { applyLazy(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();

(function () {
  // Mobile hamburger menu toggle
  var menuToggle = document.getElementById('menuToggle');
  var navLinks = document.getElementById('navLinks');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('open');
      menuToggle.classList.toggle('open', isOpen);
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

// Site-wide SEO defaults — fills in OG tags, robots, and keywords if the page
// doesn't already define them, so every page gets a decent social-share
// preview and search directive without needing to edit each HTML file.
(function () {
  function ensureMeta(selector, attrs) {
    var el = document.querySelector(selector);
    if (el) return el; // page already defines this tag — leave it alone
    el = document.createElement('meta');
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    document.head.appendChild(el);
    return el;
  }

  fetch('/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s.default_robots) ensureMeta('meta[name="robots"]', { name: 'robots', content: s.default_robots });
      if (s.default_keywords) ensureMeta('meta[name="keywords"]', { name: 'keywords', content: s.default_keywords });
      if (s.default_canonical) {
        if (!document.querySelector('link[rel="canonical"]')) {
          var link = document.createElement('link');
          link.setAttribute('rel', 'canonical');
          link.setAttribute('href', s.default_canonical);
          document.head.appendChild(link);
        }
      }
      var currentTitle = document.title || '';
      var currentDesc = (document.querySelector('meta[name="description"]') || {}).content || '';
      ensureMeta('meta[property="og:title"]', { property: 'og:title', content: currentTitle || s.default_meta_title || '' });
      ensureMeta('meta[property="og:description"]', { property: 'og:description', content: currentDesc || s.default_meta_description || '' });
      if (s.default_og_image) ensureMeta('meta[property="og:image"]', { property: 'og:image', content: s.default_og_image });
      ensureMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    })
    .catch(function (err) { console.warn('Could not load SEO defaults:', err); });
})();

(function () {
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value) el.textContent = value;
  }

  fetch('/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s.site_phone) {
        var telHref = 'tel:' + s.site_phone.replace(/[^0-9+]/g, '');
        var topbarPhone = document.getElementById('topbarPhone');
        if (topbarPhone) { topbarPhone.textContent = s.site_phone; topbarPhone.href = telHref; }
        setText('contactPhoneVal', s.site_phone);
        var callFloat = document.getElementById('callFloat');
        if (callFloat) callFloat.href = telHref;
      }

      // Email (topbar + footer + contact page)
      if (s.site_email) {
        var mailtoHref = 'mailto:' + s.site_email;
        var topbarEmail = document.getElementById('topbarEmail');
        if (topbarEmail) { topbarEmail.textContent = s.site_email; topbarEmail.href = mailtoHref; }
        var footerEmail = document.getElementById('footerEmailLink');
        if (footerEmail) { footerEmail.textContent = s.site_email; footerEmail.href = mailtoHref; }
        setText('contactEmailVal', s.site_email);
      }

      // Address (topbar badge, footer, contact page)
      if (s.site_address) {
        var topbarAddress = document.getElementById('topbarAddress');
        if (topbarAddress) topbarAddress.textContent = 'Based in ' + s.site_address;
        setText('footerBottomAddress', s.site_address);
        var footerAddressLink = document.getElementById('footerAddressLink');
        if (footerAddressLink) footerAddressLink.textContent = s.site_address;
        setText('contactAddressVal', s.site_address);
      }

      // Business hours (contact page)
      setText('contactHoursVal', s.site_hours);

      // Logo (header + footer) — if an image has been uploaded, show it and hide the text logo.
      // The footer can optionally use its own separate logo (falls back to the main one).
      if (s.site_logo_url) {
        var headerImg = document.getElementById('siteLogoImg');
        if (headerImg) { headerImg.src = s.site_logo_url; headerImg.style.display = 'inline-block'; }
        var headerText = document.getElementById('siteLogoText');
        if (headerText) headerText.style.display = 'none';
      }
      var footerLogoUrl = s.footer_logo_url || s.site_logo_url;
      if (footerLogoUrl) {
        var footerImg = document.getElementById('footerLogoImg');
        if (footerImg) { footerImg.src = footerLogoUrl; footerImg.style.display = 'inline-block'; }
        var footerText = document.getElementById('footerLogoText');
        if (footerText) footerText.style.display = 'none';
      }
      setText('footerDescription', s.footer_description);
      setText('footerCopyright', s.footer_copyright);

      // WhatsApp floating button — only shown if a WhatsApp number was set
      if (s.site_whatsapp) {
        var wa = document.getElementById('whatsappFloat');
        if (wa) {
          wa.href = 'https://wa.me/' + s.site_whatsapp.replace(/[^0-9]/g, '');
          wa.style.display = 'flex';
        }
      }

      // Footer social media icons
      var socialContainer = document.getElementById('footerSocialIcons');
      if (socialContainer) {
        var socials = [
          { url: s.social_facebook, label: 'Facebook', icon: 'f' },
          { url: s.social_instagram, label: 'Instagram', icon: '◎' },
          { url: s.social_linkedin, label: 'LinkedIn', icon: 'in' },
          { url: s.social_twitter, label: 'Twitter / X', icon: 'X' },
          { url: s.social_youtube, label: 'YouTube', icon: '▶' }
        ].filter(function (item) { return item.url; });
        socialContainer.innerHTML = socials.map(function (item) {
          return '<a href="' + item.url + '" target="_blank" rel="noopener" aria-label="' + item.label + '" ' +
            'style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.1); color:#fff; font-size:13px; font-weight:700; text-decoration:none;">' + item.icon + '</a>';
        }).join('');
      }

      // Homepage hero trust stats
      for (let i = 1; i <= 4; i++) {
        var numEl = document.getElementById('heroStat' + i + 'Num');
        var labelEl = document.getElementById('heroStat' + i + 'Label');
        if (numEl && s['stat' + i + '_number']) numEl.textContent = s['stat' + i + '_number'];
        if (labelEl && s['stat' + i + '_label']) labelEl.textContent = s['stat' + i + '_label'];
      }

      // Payment details card (contact page only)
      var paymentCard = document.getElementById('paymentInfoCard');
      if (paymentCard) {
        var hasPayment = s.payment_upi || s.payment_bank_name || s.payment_qr_url || s.payment_note;
        if (hasPayment) {
          paymentCard.style.display = 'block';

          if (s.payment_upi) {
            document.getElementById('paymentUpiRow').style.display = 'flex';
            setText('paymentUpiVal', s.payment_upi);

            var upiBtn = document.getElementById('payUpiButton');
            if (upiBtn) {
              var payeeName = encodeURIComponent('Mishty Web');
              var note = encodeURIComponent('Payment to Mishty Web');
              upiBtn.href = 'upi://pay?pa=' + encodeURIComponent(s.payment_upi) + '&pn=' + payeeName + '&tn=' + note + '&cu=INR';
              upiBtn.style.display = 'inline-flex';
              var hintRow = document.getElementById('payUpiHintRow');
              if (hintRow) hintRow.style.display = 'block';
            }
          }

          if (s.payment_bank_name || s.payment_account_number) {
            var bankParts = [];
            if (s.payment_account_name) bankParts.push(s.payment_account_name);
            if (s.payment_bank_name) bankParts.push(s.payment_bank_name);
            if (s.payment_account_number) bankParts.push('A/C: ' + s.payment_account_number);
            if (s.payment_ifsc) bankParts.push('IFSC: ' + s.payment_ifsc);
            document.getElementById('paymentBankRow').style.display = 'flex';
            setText('paymentBankVal', bankParts.join(' · '));
          }

          if (s.payment_note) {
            document.getElementById('paymentNoteRow').style.display = 'flex';
            setText('paymentNoteVal', s.payment_note);
          }

          if (s.payment_qr_url) {
            document.getElementById('paymentQrRow').style.display = 'block';
            document.getElementById('paymentQrImg').src = s.payment_qr_url;
          }
        }
      }

      // JSON-LD structured data (LocalBusiness) for SEO
      try {
        const schema = {
          "@context": "https://schema.org",
          "@type": "ProfessionalService",
          "name": "Mishty Web",
          "description": s.site_tagline || "Digital marketing and web development agency",
          "telephone": s.site_phone || undefined,
          "email": s.site_email || undefined,
          "address": { "@type": "PostalAddress", "addressLocality": s.site_address || undefined },
          "url": window.location.origin,
          "sameAs": [s.social_facebook, s.social_instagram, s.social_linkedin, s.social_twitter, s.social_youtube].filter(Boolean)
        };
        const schemaScript = document.createElement('script');
        schemaScript.type = 'application/ld+json';
        schemaScript.textContent = JSON.stringify(schema);
        document.head.appendChild(schemaScript);
      } catch (e) { /* schema injection is non-critical */ }
    })
    .catch(function (err) {
      console.warn('Could not load site settings:', err);
    });

  // Extra nav links added from Admin > Navigation — appended after the core menu.
  ['header', 'footer'].forEach(function (location) {
    var containerId = location === 'header' ? 'navExtraLinks' : 'footerExtraLinks';
    var container = document.getElementById(containerId);
    if (!container) return;
    fetch('/api/nav-items?location=' + location)
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (!items || !items.length) return;
        container.innerHTML = items.map(function (n) {
          var target = n.open_new_tab ? ' target="_blank" rel="noopener"' : '';
          return '<a href="' + n.url + '"' + target + '>' + n.label + '</a>';
        }).join('');
      })
      .catch(function (err) { console.warn('Could not load ' + location + ' nav links:', err); });
  });

  // Footer legal/info page links (Privacy Policy, Terms, Refund Policy, Disclaimer, etc.)
  var legalContainer = document.getElementById('footerLegalLinks');
  if (legalContainer) {
    fetch('/api/pages')
      .then(function (r) { return r.json(); })
      .then(function (pages) {
        if (!pages || !pages.length) return;
        legalContainer.innerHTML = pages
          .map(function (p) { return '<a href="/page.html?slug=' + encodeURIComponent(p.slug) + '" style="color:inherit; opacity:1;">' + p.title + '</a>'; })
          .join(' &nbsp;·&nbsp; ');
      })
      .catch(function (err) {
        console.warn('Could not load footer pages:', err);
      });
  }
})();

// Hero Slider — driven by Admin > Website CMS > Hero Slider. If no slides are
// configured, the hardcoded default markup already in the page is left as-is.
(function () {
  var heroSection = document.getElementById('heroSection');
  if (!heroSection) return; // this page has no hero (e.g. inner pages)

  fetch('/api/hero-slides')
    .then(function (r) { return r.json(); })
    .then(function (slides) {
      if (!slides || !slides.length) return;

      var idx = 0;
      var dotsEl = document.getElementById('heroDots');

      function applySlide(s) {
        var badgeText = document.getElementById('heroBadgeText');
        if (badgeText && s.badge) badgeText.textContent = s.badge;
        var heading = document.getElementById('heroHeading');
        var highlight = document.getElementById('heroHighlight');
        if (heading && s.heading) {
          heading.childNodes[0].textContent = s.heading + ' ';
          if (highlight) highlight.textContent = s.highlight || '';
        }
        var desc = document.getElementById('heroDescription');
        if (desc && s.description) desc.textContent = s.description;

        var btn1 = document.getElementById('heroBtn1');
        if (btn1 && s.button1_text) { btn1.textContent = s.button1_text; btn1.href = s.button1_link || '#'; }
        var btn2 = document.getElementById('heroBtn2');
        if (btn2 && s.button2_text) { btn2.textContent = s.button2_text; btn2.href = s.button2_link || '#'; }

        var floatImg = document.getElementById('heroFloatingImage');
        if (floatImg) {
          if (s.floating_image) { floatImg.src = s.floating_image; floatImg.alt = s.image_alt || ''; floatImg.style.display = 'block'; }
          else { floatImg.style.display = 'none'; }
        }

        var isMobile = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
        var bannerUrl = (isMobile && s.mobile_image) ? s.mobile_image : s.desktop_image;
        if (bannerUrl) {
          heroSection.style.backgroundImage = 'linear-gradient(rgba(10,20,40,0.35), rgba(10,20,40,0.35)), url(' + bannerUrl + ')';
          heroSection.style.backgroundSize = 'cover';
          heroSection.style.backgroundPosition = 'center';
        } else if (s.bg_image) {
          heroSection.style.backgroundImage = 'url(' + s.bg_image + ')';
          heroSection.style.backgroundSize = 'cover';
          heroSection.style.backgroundPosition = 'center';
        }

        ['heroStat1', 'heroStat2', 'heroStat3', 'heroStat4'].forEach(function () {}); // stats stay driven by /api/settings

        if (s.rating) { var el = document.getElementById('heroStat1Num'); if (el) el.textContent = s.rating; }
        if (s.projects_count) { var el2 = document.getElementById('heroStat2Num'); if (el2) el2.textContent = s.projects_count; }
        if (s.happy_clients) { var el3 = document.getElementById('heroStat3Num'); if (el3) el3.textContent = s.happy_clients; }
        if (s.experience) { var el4 = document.getElementById('heroStat4Num'); if (el4) el4.textContent = s.experience; }

        if (s.seo_title) document.title = s.seo_title;
        if (s.seo_description) {
          var metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.setAttribute('content', s.seo_description);
        }
      }

      function renderDots() {
        if (!dotsEl || slides.length < 2) return;
        dotsEl.style.display = 'flex';
        dotsEl.innerHTML = slides.map(function (_, i) {
          return '<button data-i="' + i + '" aria-label="Go to slide ' + (i + 1) + '" style="width:9px; height:9px; border-radius:50%; border:none; cursor:pointer; background:' +
            (i === idx ? 'var(--blue,#1768D1)' : 'rgba(255,255,255,0.6)') + ';"></button>';
        }).join('');
        Array.prototype.forEach.call(dotsEl.querySelectorAll('button'), function (btn) {
          btn.addEventListener('click', function () {
            idx = parseInt(btn.getAttribute('data-i'), 10);
            showSlide();
          });
        });
      }

      var rotateTimer = null;
      function showSlide() {
        applySlide(slides[idx]);
        renderDots();
        if (rotateTimer) clearTimeout(rotateTimer);
        var current = slides[idx];
        if (slides.length > 1 && current.autoplay) {
          rotateTimer = setTimeout(function () {
            idx = (idx + 1) % slides.length;
            showSlide();
          }, current.delay_ms || 6000);
        }
      }

      showSlide();
    })
    .catch(function (err) { console.warn('Could not load hero slides:', err); });
})();

// FAQ section — driven by Admin > Website CMS > FAQs. Hidden entirely if none are set.
(function () {
  var faqSection = document.getElementById('faqSection');
  var faqList = document.getElementById('faqList');
  if (!faqSection || !faqList) return;

  fetch('/api/faqs')
    .then(function (r) { return r.json(); })
    .then(function (faqs) {
      if (!faqs || !faqs.length) return;
      faqSection.style.display = 'block';
      faqList.innerHTML = faqs.map(function (f, i) {
        return '<details style="background:#fff; border:1px solid var(--line,#e2e8f0); border-radius:10px; padding:14px 18px;"' + (i === 0 ? ' open' : '') + '>' +
          '<summary style="cursor:pointer; font-weight:600; color:var(--navy,#0B1F3A);">' + f.question + '</summary>' +
          '<p style="margin:10px 0 0; color:var(--gray,#5B6B82); line-height:1.6;">' + f.answer + '</p>' +
          '</details>';
      }).join('');
    })
    .catch(function (err) { console.warn('Could not load FAQs:', err); });
})();
