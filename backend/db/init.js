const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { seedCatalog } = require('./catalog-seed');

// better-sqlite3 works on any Node 18+ install (native prebuilt binary) —
// unlike the built-in node:sqlite module, which needs Node 22.5+ and would
// crash on most shared/cPanel hosting that still ships Node 18/20.
const db = new Database(path.join(__dirname, 'mishtyweb.db'));
db.pragma('journal_mode = WAL');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      tag TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      hero_subtitle TEXT NOT NULL DEFAULT '',
      features TEXT NOT NULL DEFAULT '[]',
      benefits TEXT NOT NULL DEFAULT '[]',
      process_steps TEXT NOT NULL DEFAULT '[]',
      price_note TEXT NOT NULL DEFAULT '',
      options TEXT NOT NULL DEFAULT '[]',
      icon TEXT NOT NULL DEFAULT 'WEB',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      show_in_footer INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      project_url TEXT NOT NULL DEFAULT '',
      tech_stack TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      tag TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      thumb_label TEXT NOT NULL,
      featured_image TEXT NOT NULL DEFAULT '',
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      meta_keywords TEXT NOT NULL DEFAULT '',
      read_time TEXT NOT NULL DEFAULT '5 min read',
      author TEXT NOT NULL DEFAULT 'Mishty Web',
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      client_role TEXT NOT NULL DEFAULT '',
      quote TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      avatar_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS client_logos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL,
      service TEXT,
      message TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS catalog_technologies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category_id, slug)
    );

    CREATE TABLE IF NOT EXISTS catalog_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technology_id INTEGER NOT NULL,
      tier TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      price_suffix TEXT NOT NULL DEFAULT '',
      delivery_time TEXT NOT NULL DEFAULT '',
      support_duration TEXT NOT NULL DEFAULT '',
      revisions TEXT NOT NULL DEFAULT '',
      features TEXT NOT NULL DEFAULT '[]',
      is_popular INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(technology_id, tier)
    );

    CREATE TABLE IF NOT EXISTS hero_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      badge TEXT NOT NULL DEFAULT '',
      heading TEXT NOT NULL,
      highlight TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      button1_text TEXT NOT NULL DEFAULT '',
      button1_link TEXT NOT NULL DEFAULT '',
      button2_text TEXT NOT NULL DEFAULT '',
      button2_link TEXT NOT NULL DEFAULT '',
      desktop_image TEXT NOT NULL DEFAULT '',
      mobile_image TEXT NOT NULL DEFAULT '',
      bg_image TEXT NOT NULL DEFAULT '',
      floating_image TEXT NOT NULL DEFAULT '',
      image_alt TEXT NOT NULL DEFAULT '',
      rating TEXT NOT NULL DEFAULT '',
      projects_count TEXT NOT NULL DEFAULT '',
      happy_clients TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      autoplay INTEGER NOT NULL DEFAULT 1,
      delay_ms INTEGER NOT NULL DEFAULT 6000,
      animation TEXT NOT NULL DEFAULT 'fade-up',
      transition TEXT NOT NULL DEFAULT 'fade',
      schedule_start TEXT NOT NULL DEFAULT '',
      schedule_end TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS nav_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL DEFAULT 'header',
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      open_new_tab INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_slug TEXT NOT NULL DEFAULT '',
      category_name TEXT NOT NULL DEFAULT '',
      technology_slug TEXT NOT NULL DEFAULT '',
      technology_name TEXT NOT NULL DEFAULT '',
      package_tier TEXT NOT NULL DEFAULT '',
      package_name TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      price_suffix TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      budget TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '',
      file_url TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT NOT NULL DEFAULT 'website-catalog',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Defensive migration: add image_url column if this DB was created before it existed
  try {
    const cols = db.prepare("PRAGMA table_info(gallery_items)").all();
    const hasImage = cols.some(c => c.name === 'image_url');
    if (!hasImage) {
      db.exec('ALTER TABLE gallery_items ADD COLUMN image_url TEXT');
    }
  } catch (e) {
    console.warn('Migration check for gallery_items.image_url failed:', e.message);
  }

  // Defensive migration: add options column to services if this DB predates it
  try {
    const cols = db.prepare("PRAGMA table_info(services)").all();
    const hasOptions = cols.some(c => c.name === 'options');
    if (!hasOptions) {
      db.exec("ALTER TABLE services ADD COLUMN options TEXT NOT NULL DEFAULT '[]'");
    }
    const serviceExtra = [
      ['slug', "ALTER TABLE services ADD COLUMN slug TEXT"],
      ['hero_subtitle', "ALTER TABLE services ADD COLUMN hero_subtitle TEXT NOT NULL DEFAULT ''"],
      ['benefits', "ALTER TABLE services ADD COLUMN benefits TEXT NOT NULL DEFAULT '[]'"],
      ['process_steps', "ALTER TABLE services ADD COLUMN process_steps TEXT NOT NULL DEFAULT '[]'"],
      ['price_note', "ALTER TABLE services ADD COLUMN price_note TEXT NOT NULL DEFAULT ''"]
    ];
    serviceExtra.forEach(([col, sql]) => {
      if (!cols.some(c => c.name === col)) db.exec(sql);
    });
  } catch (e) {
    console.warn('Migration check for services table failed:', e.message);
  }

  // Defensive migration: gallery_items extra fields
  try {
    const cols = db.prepare("PRAGMA table_info(gallery_items)").all();
    if (!cols.some(c => c.name === 'project_url')) db.exec("ALTER TABLE gallery_items ADD COLUMN project_url TEXT NOT NULL DEFAULT ''");
    if (!cols.some(c => c.name === 'tech_stack')) db.exec("ALTER TABLE gallery_items ADD COLUMN tech_stack TEXT NOT NULL DEFAULT '[]'");
  } catch (e) {
    console.warn('Migration check for gallery_items extra fields failed:', e.message);
  }

  // Defensive migration: blog_posts extra fields
  try {
    const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
    if (!cols.some(c => c.name === 'slug')) db.exec('ALTER TABLE blog_posts ADD COLUMN slug TEXT');
    if (!cols.some(c => c.name === 'content')) db.exec("ALTER TABLE blog_posts ADD COLUMN content TEXT NOT NULL DEFAULT ''");
    if (!cols.some(c => c.name === 'featured_image')) db.exec("ALTER TABLE blog_posts ADD COLUMN featured_image TEXT NOT NULL DEFAULT ''");
    if (!cols.some(c => c.name === 'meta_title')) db.exec("ALTER TABLE blog_posts ADD COLUMN meta_title TEXT NOT NULL DEFAULT ''");
    if (!cols.some(c => c.name === 'meta_description')) db.exec("ALTER TABLE blog_posts ADD COLUMN meta_description TEXT NOT NULL DEFAULT ''");
    if (!cols.some(c => c.name === 'meta_keywords')) db.exec("ALTER TABLE blog_posts ADD COLUMN meta_keywords TEXT NOT NULL DEFAULT ''");
  } catch (e) {
    console.warn('Migration check for blog_posts extra fields failed:', e.message);
  }

  // Backfill any missing slugs (services, blog posts) for rows created before slugs existed
  function slugifyValue(text) {
    return String(text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  try {
    const svcRows = db.prepare('SELECT id, tag, title, slug FROM services').all();
    const svcUpd = db.prepare('UPDATE services SET slug = ? WHERE id = ?');
    svcRows.forEach(r => {
      if (!r.slug) {
        const base = slugifyValue(r.tag.replace(/^\d+\s*[—-]\s*/, '')) || slugifyValue(r.title) || ('service-' + r.id);
        svcUpd.run(base, r.id);
      }
    });
    const blogRows = db.prepare('SELECT id, title, slug FROM blog_posts').all();
    const blogUpd = db.prepare('UPDATE blog_posts SET slug = ? WHERE id = ?');
    blogRows.forEach(r => {
      if (!r.slug) {
        const base = slugifyValue(r.title) || ('post-' + r.id);
        blogUpd.run(base, r.id);
      }
    });
  } catch (e) {
    console.warn('Slug backfill failed:', e.message);
  }

  // Seed default site settings if empty (site contact info, logo, payment details)
  const defaultSettings = {
    site_phone: '+91-XXXXXXXXXX',
    site_whatsapp: '',
    site_email: 'hello@mishtyweb.com',
    site_address: 'Khargone, Madhya Pradesh, India',
    site_hours: 'Mon – Sat, 10:00 AM – 7:00 PM',
    site_logo_url: '',
    site_tagline: 'Websites, marketing, and branding — built in-house by one accountable team.',
    payment_upi: '',
    payment_bank_name: '',
    payment_account_name: '',
    payment_account_number: '',
    payment_ifsc: '',
    payment_qr_url: '',
    payment_note: '',
    social_facebook: '',
    social_instagram: '',
    social_linkedin: '',
    social_twitter: '',
    social_youtube: '',
    stat1_number: '50+',
    stat1_label: 'Projects Delivered',
    stat2_number: '5+',
    stat2_label: 'Years Experience',
    stat3_number: '30+',
    stat3_label: 'Happy Clients',
    stat4_number: '4',
    stat4_label: 'Industries Served'
  };
  const settingStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(defaultSettings).forEach(([key, value]) => settingStmt.run(key, value));

  // Seed legal / info pages if empty (Privacy Policy, Terms, Refund Policy, Disclaimer)
  const pageCount = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  if (pageCount === 0) {
    const pages = [
      {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        content: `Mishty Web ("we", "us", "our") respects your privacy. This page explains what information we collect through this website and how we use it.

Information We Collect
When you fill out our contact form, we collect your name, phone number, email address, the service you're interested in, and your message. We may also collect basic technical data (like browser type and pages visited) through standard website analytics.

How We Use Your Information
We use the information you share to respond to your enquiry, discuss your project, and send you updates related to work you've asked us about. We do not sell or rent your personal information to third parties.

Data Storage
Your enquiry details are stored securely in our systems and are only accessible to our team for the purpose of responding to you.

Cookies
This website may use basic cookies to improve browsing experience. You can disable cookies in your browser settings at any time.

Your Rights
You can request that we update or delete any personal information we hold about you by contacting us using the details on our Contact page.

Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted on this page.`
      },
      {
        slug: 'terms-conditions',
        title: 'Terms & Conditions',
        content: `These Terms & Conditions govern your use of the Mishty Web website and any services provided by Mishty Web ("we", "us", "our").

Services
We provide website development, digital marketing, SEO, branding, and custom web application services as agreed in a written quotation or proposal with each client. The exact scope, timeline, and cost for any project will be confirmed separately before work begins.

Client Responsibilities
Clients are expected to provide timely content, feedback, and approvals needed to complete a project. Delays in providing these may affect project timelines.

Payments
Payment terms (advance, milestones, final payment) will be shared in your project quotation. Work may be paused if agreed payment milestones are not met.

Intellectual Property
Once a project is paid for in full, ownership of the final deliverables (website code, designs, etc. built specifically for the client) transfers to the client, unless otherwise agreed in writing. Any third-party tools, plugins, or licensed assets used remain subject to their own licenses.

Limitation of Liability
We aim to deliver quality work, but we are not liable for indirect losses arising from the use of a website or campaign we manage, including third-party platform outages (hosting, Google, Meta, etc.).

Changes to These Terms
We may update these Terms from time to time. Continued use of our services after changes are posted means you accept the updated Terms.`
      },
      {
        slug: 'refund-policy',
        title: 'Payment & Refund Policy',
        content: `This policy explains how payments and refunds work for projects and services with Mishty Web.

Advance Payment
Most projects require an advance payment before work begins, as specified in your quotation. This advance is non-refundable once work has started, since it covers time and resources already committed to your project.

Milestone Payments
For larger projects, payment may be split into milestones. Each milestone payment is due once the corresponding stage of work is delivered for review.

Refunds
Refunds, if applicable, are considered on a case-by-case basis and only for the portion of work not yet started or delivered. Once a website, campaign, or design has been delivered and approved, no refund will be issued for that portion of the project.

Ad Spend (Google Ads / Meta Ads)
Any advertising budget spent directly with Google or Meta on your behalf is non-refundable, as this amount is paid to the ad platform and not retained by us. Our management fee for running these campaigns follows the same advance/milestone terms above.

Cancellations
If you wish to cancel an ongoing project, please contact us as soon as possible. You will be billed only for the work completed up to the point of cancellation.

Contact for Payment Issues
For any questions about an invoice, payment, or refund, please reach out via our Contact page and we'll be happy to help.`
      },
      {
        slug: 'disclaimer',
        title: 'Disclaimer',
        content: `The information on this website is provided by Mishty Web for general informational purposes only. While we try to keep information accurate and up to date, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the content on this site.

Results May Vary
Any examples, case studies, or results mentioned on this website (such as marketing performance or project outcomes) reflect specific past projects and do not guarantee similar results for every business, as outcomes depend on many factors outside our control.

Third-Party Links
Our website may contain links to third-party websites (such as client sites or platforms like Google and Meta). We are not responsible for the content, policies, or practices of any third-party websites.

Professional Advice
Content on this website should not be taken as legal, financial, or professional advice. Please consult the relevant professional for advice specific to your situation.

Limitation of Liability
In no event will Mishty Web be liable for any loss or damage arising from the use of this website or reliance on any information provided on it.`
      }
    ];
    const stmt = db.prepare('INSERT INTO pages (slug, title, content, sort_order) VALUES (@slug, @title, @content, @order)');
    pages.forEach((p, i) => stmt.run({ ...p, order: i }));
  }

  // Seed admin user if none exists
  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (adminCount === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    // Never fall back to a fixed, publicly-documented password. If ADMIN_PASSWORD
    // isn't set, generate a random one-time password and print it once so the
    // account can never be guessed from a stale README/.env.example.
    let password = process.env.ADMIN_PASSWORD;
    let generated = false;
    if (!password) {
      password = require('crypto').randomBytes(9).toString('base64url');
      generated = true;
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
    if (generated) {
      console.log('\n================ ADMIN ACCOUNT CREATED ================');
      console.log(`  Username: ${username}`);
      console.log(`  Password: ${password}`);
      console.log('  (ADMIN_PASSWORD was not set in .env — this random password');
      console.log('   was generated. Save it now and set ADMIN_PASSWORD in .env');
      console.log('   for future restarts, or change it from Admin > Settings.)');
      console.log('=========================================================\n');
    }
    console.log(`Seeded admin user "${username}" — change this password after first login.`);
  }

  // Seed testimonials if empty
  const testimonialCount = db.prepare('SELECT COUNT(*) AS c FROM testimonials').get().c;
  if (testimonialCount === 0) {
    const testimonials = [
      { client_name: 'Vikash Chauhan', client_role: 'Owner, Vikash Travels', quote: 'Mishty Web built our booking platform from scratch and it just works — fare calculation, three pricing tiers, all live and easy for our team to manage.', rating: 5 },
      { client_name: 'Komal Pads (Pahal)', client_role: 'Founder', quote: 'They understood our brand immediately and the website reflects it perfectly. Support after launch has been just as good as during the build.', rating: 5 },
      { client_name: 'Balaji Enterprise', client_role: 'Director', quote: 'From branding to the quotation system, everything feels consistent and professional now. Clients take us more seriously.', rating: 5 }
    ];
    const stmt = db.prepare('INSERT INTO testimonials (client_name, client_role, quote, rating, sort_order) VALUES (@client_name, @client_role, @quote, @rating, @order)');
    testimonials.forEach((t, i) => stmt.run({ ...t, order: i }));
  }

  // Seed gallery if empty
  const galleryCount = db.prepare('SELECT COUNT(*) AS c FROM gallery_items').get().c;
  if (galleryCount === 0) {
    const items = [
      { category: 'travel', category_label: 'Travel & Booking', title: 'Vikash Travels Premium', description: 'Booking platform with live fare calculation, city autocomplete, and three deployable tiers.', tech_stack: JSON.stringify(['React', 'Node.js', 'SQLite']) },
      { category: 'brand', category_label: 'Personal Care', title: 'Pahal', description: 'Brand website with hero, testimonials, trust badges, and product imagery for a shampoo & conditioner line.', tech_stack: JSON.stringify(['HTML/CSS', 'JavaScript']) },
      { category: 'recruitment', category_label: 'Recruitment', title: 'JobPortal Pro Enterprise', description: '60+ page recruitment platform across public, candidate, employer, and admin views.', tech_stack: JSON.stringify(['React', 'Node.js', 'Express']) },
      { category: 'manufacturing', category_label: 'Manufacturing', title: 'Balaji Enterprise', description: 'Digital presence and branding for a cotton bati & diya wicks manufacturer, including a quotation system.', tech_stack: JSON.stringify(['WordPress', 'WooCommerce']) },
      { category: 'travel', category_label: 'Travel & Booking', title: 'Vikash Chauhan Tour & Travels', description: 'Earlier WordPress-compatible site in a JustDial-style layout for local travel bookings.', tech_stack: JSON.stringify(['WordPress']) },
      { category: 'recruitment', category_label: 'Internal Tools', title: 'Agency ERP Pro', description: 'Desktop ERP app with CRM, client profiles, and digital marketing modules built for agency operations.', tech_stack: JSON.stringify(['Electron', 'React', 'Node.js']) }
    ];
    const stmt = db.prepare('INSERT INTO gallery_items (category, category_label, title, description, tech_stack, sort_order) VALUES (@category, @category_label, @title, @description, @tech_stack, @order)');
    items.forEach((it, i) => stmt.run({ ...it, order: i }));
  }

  // Seed blog if empty
  const blogCount = db.prepare('SELECT COUNT(*) AS c FROM blog_posts').get().c;
  if (blogCount === 0) {
    const posts = [
      { slug: 'why-your-local-business-needs-more-than-a-facebook-page', tag: 'Web Development', title: 'Why your local business needs more than a Facebook page', excerpt: "A dedicated website builds trust that a social profile alone can't — here's what a first website should actually include.", thumb_label: 'Websites', read_time: '5 min read',
        content: `A Facebook or Instagram page is a good start, but it isn't a substitute for a website — especially once a business is serious about growing.\n\nWhy a website still matters\nA website is the one place online that's entirely yours. You aren't competing with an algorithm to be seen, you aren't limited to a platform's design templates, and you control exactly what a visitor sees first.\n\nWhat a first website should include\nAt minimum: a clear description of what you offer, your contact details (phone, WhatsApp, address), a few photos of your work or products, and a simple way for someone to enquire. Everything else — blog, gallery, detailed service pages — can be added as the business grows.\n\nTrust matters more than people admit\nMany customers quietly check if a business has a real website before calling. A simple, professional site signals that a business is established and easy to reach — even if the product or service itself hasn't changed.\n\nStart simple\nYou don't need a 20-page website on day one. A clean single page with your services, contact info, and a couple of photos is enough to start building that trust.` },
      { slug: 'google-ads-vs-meta-ads-which-fits-your-business', tag: 'Digital Marketing', title: 'Google Ads vs Meta Ads: which one fits your business?', excerpt: 'Search intent versus scroll-stopping visuals — a plain breakdown of when each platform actually works better.', thumb_label: 'Ads', read_time: '6 min read',
        content: `Both platforms work, but they work differently — and picking the wrong one for your business stage is a common way to waste budget.\n\nGoogle Ads: capturing existing demand\nGoogle Ads shows up when someone is already searching for what you offer — "plumber near me", "buy running shoes online". It's best when people already know they want your type of product or service and just need to find you.\n\nMeta Ads: creating demand\nInstagram and Facebook Ads work differently — you're interrupting someone's scroll to introduce them to something they weren't actively searching for. This works well for visually appealing products, offers, and brand awareness.\n\nWhich one should you start with?\nIf your business solves a problem people actively search for (services, repairs, purchases with intent), start with Google Ads. If your product is visual and impulse-driven (fashion, food, home decor), Meta Ads often perform better.\n\nThe honest answer\nMost growing businesses eventually use both — Google to capture people ready to buy, and Meta to build the audience that becomes tomorrow's searches.` },
      { slug: 'what-a-quotation-deck-says-about-your-business', tag: 'Branding', title: 'What a quotation deck says about your business before you say a word', excerpt: 'Consistent branding on something as simple as a quotation can be the difference between winning and losing a client.', thumb_label: 'Branding', read_time: '4 min read',
        content: `A quotation is often the first "document" a potential client receives from you — and it's judged before a single word is read.\n\nFirst impressions are visual\nA quotation with your logo, consistent colors, and clean formatting signals that you run an organised business. A plain text message or a messy spreadsheet, even with the same pricing, signals the opposite.\n\nConsistency builds recall\nWhen your quotation, invoice, and website all use the same colors and logo, it reinforces your brand every time a client sees any of them — building recognition without extra effort.\n\nIt doesn't need to be expensive\nA well-designed quotation template, built once, can be reused for every client. The investment is small compared to the number of times it gets seen.\n\nStart with the basics\nLogo, business name, consistent color, and clear pricing structure — that alone puts you ahead of competitors still sending plain text quotes.` },
      { slug: 'tiered-pricing-helped-a-travel-client-scale', tag: 'Case Study', title: 'How tiered pricing helped a travel client scale without a rebuild', excerpt: 'Splitting a booking platform into Basic, Business, and Premium tiers let the client grow without starting over.', thumb_label: 'Booking', read_time: '7 min read',
        content: `When we built a booking platform for a travel client, the brief wasn't just "build a website" — it was "build something that can grow with us."\n\nThe problem with single-tier builds\nMany small business websites are built once and then need a costly rebuild the moment the business adds new services or pricing structures. That's expensive and slow.\n\nThe tiered approach\nWe structured the booking platform into three deployable tiers — Basic, Business, and Premium — each unlocking more features (live fare calculation, city autocomplete, multi-vehicle booking) without needing a new codebase.\n\nWhat this meant for the client\nAs demand grew, the client could upgrade to a higher tier instead of commissioning an entirely new website. This saved both time and cost, and meant zero downtime during the upgrade.\n\nThe takeaway\nIf you expect your business to grow in the next 1–2 years, it's worth discussing a tiered or modular build from the start — even if you only need the basic tier today.` },
      { slug: 'what-enterprise-recruitment-platforms-get-right', tag: 'Web Development', title: 'What enterprise recruitment platforms get right (and how small builds can borrow it)', excerpt: 'Lessons from building a 60+ page job portal, applied to smaller-scale hiring pages.', thumb_label: 'Hiring', read_time: '6 min read',
        content: `Building a 60+ page recruitment platform taught us a few things that apply even to a business with a single "Careers" page.\n\nSeparate flows for different users\nEnterprise job portals separate candidates, employers, and admins into distinct experiences. Even a small hiring page benefits from this thinking — a simple "Apply Now" form is very different from what an employer posting a job needs to see.\n\nStructured data pays off later\nStoring job listings, applications, and candidate details in a structured way (not just an inbox of emails) makes it dramatically easier to search, filter, and report on hiring activity later.\n\nSimple onboarding matters at every scale\nEnterprise platforms invest heavily in making sign-up and application flows frictionless. The same principle — fewer form fields, clear next steps — improves conversion on a small business careers page too.\n\nBorrow the thinking, not the budget\nYou don't need a 60-page platform to hire well. But structuring even a simple hiring form the way enterprise platforms do will save you time as you grow.` },
      { slug: 'getting-a-khargone-business-found-on-google-maps', tag: 'Digital Marketing', title: 'Getting a Khargone business found on Google Maps', excerpt: 'Simple local SEO steps that matter more for small-town businesses than most generic SEO guides admit.', thumb_label: 'Local SEO', read_time: '5 min read',
        content: `Most SEO advice online is written for large cities with heavy competition. For a business in a smaller town like Khargone, a few simple steps go a much longer way.\n\nClaim and complete your Google Business Profile\nThis is the single highest-impact step. Make sure your business name, category, address, phone number, and hours are all filled in accurately — incomplete profiles rank lower.\n\nCollect reviews consistently\nIn smaller towns, review count and recency matter a lot, since there's less competition to out-rank. Ask happy customers directly for a review right after a good experience.\n\nUse your city name naturally\nMention your city and nearby landmarks naturally in your website content and Google Business Profile posts — this helps Google understand exactly where to show your business.\n\nConsistency across listings\nMake sure your business name, address, and phone number are identical everywhere they appear online (website, Google, Justdial, Facebook). Inconsistent details confuse search engines and hurt rankings.\n\nSmall efforts, real results\nUnlike competitive metro markets, these basic steps alone can meaningfully move a small-town business up the local search results within a few months.` }
    ];
    const stmt = db.prepare('INSERT INTO blog_posts (slug, tag, title, excerpt, content, thumb_label, read_time) VALUES (@slug, @tag, @title, @excerpt, @content, @thumb_label, @read_time)');
    posts.forEach(p => stmt.run(p));
  }

  // Defensive migration: admins — role column (existing installs upgrade to
  // "admin" role by default, so nobody is unexpectedly locked out of anything)
  try {
    const cols = db.prepare("PRAGMA table_info(admins)").all();
    if (!cols.some(c => c.name === 'role')) {
      db.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    }
  } catch (e) {
    console.warn('Migration check for admins.role failed:', e.message);
  }

  // Defensive migration: blog_posts — sort_order for drag-drop reordering
  // (backfilled so the existing newest-first order is preserved by default)
  try {
    const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
    if (!cols.some(c => c.name === 'sort_order')) {
      db.exec("ALTER TABLE blog_posts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
      const rows = db.prepare('SELECT id FROM blog_posts ORDER BY created_at DESC').all();
      const upd = db.prepare('UPDATE blog_posts SET sort_order = ? WHERE id = ?');
      rows.forEach((r, i) => upd.run(i, r.id));
    }
  } catch (e) {
    console.warn('Migration check for blog_posts sort_order failed:', e.message);
  }

  // Defensive migration: catalog_categories — cover/mobile image, SEO, featured flag
  try {
    const cols = db.prepare("PRAGMA table_info(catalog_categories)").all();
    const extra = [
      ['cover_image', "ALTER TABLE catalog_categories ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''"],
      ['mobile_image', "ALTER TABLE catalog_categories ADD COLUMN mobile_image TEXT NOT NULL DEFAULT ''"],
      ['image_alt', "ALTER TABLE catalog_categories ADD COLUMN image_alt TEXT NOT NULL DEFAULT ''"],
      ['is_featured', "ALTER TABLE catalog_categories ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0"],
      ['seo_title', "ALTER TABLE catalog_categories ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''"],
      ['seo_description', "ALTER TABLE catalog_categories ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''"]
    ];
    extra.forEach(([col, sql]) => { if (!cols.some(c => c.name === col)) db.exec(sql); });
  } catch (e) {
    console.warn('Migration check for catalog_categories extra fields failed:', e.message);
  }

  // Defensive migration: catalog_technologies (Individual Services) — images, gallery,
  // long description, features, CTA/Buy/WhatsApp buttons, SEO
  try {
    const cols = db.prepare("PRAGMA table_info(catalog_technologies)").all();
    const extra = [
      ['cover_image', "ALTER TABLE catalog_technologies ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''"],
      ['mobile_image', "ALTER TABLE catalog_technologies ADD COLUMN mobile_image TEXT NOT NULL DEFAULT ''"],
      ['image_alt', "ALTER TABLE catalog_technologies ADD COLUMN image_alt TEXT NOT NULL DEFAULT ''"],
      ['gallery_images', "ALTER TABLE catalog_technologies ADD COLUMN gallery_images TEXT NOT NULL DEFAULT '[]'"],
      ['long_description', "ALTER TABLE catalog_technologies ADD COLUMN long_description TEXT NOT NULL DEFAULT ''"],
      ['features', "ALTER TABLE catalog_technologies ADD COLUMN features TEXT NOT NULL DEFAULT '[]'"],
      ['cta_text', "ALTER TABLE catalog_technologies ADD COLUMN cta_text TEXT NOT NULL DEFAULT ''"],
      ['cta_link', "ALTER TABLE catalog_technologies ADD COLUMN cta_link TEXT NOT NULL DEFAULT ''"],
      ['buy_button_text', "ALTER TABLE catalog_technologies ADD COLUMN buy_button_text TEXT NOT NULL DEFAULT ''"],
      ['whatsapp_message', "ALTER TABLE catalog_technologies ADD COLUMN whatsapp_message TEXT NOT NULL DEFAULT ''"],
      ['status', "ALTER TABLE catalog_technologies ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
      ['seo_title', "ALTER TABLE catalog_technologies ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''"],
      ['seo_description', "ALTER TABLE catalog_technologies ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''"]
    ];
    extra.forEach(([col, sql]) => { if (!cols.some(c => c.name === col)) db.exec(sql); });
  } catch (e) {
    console.warn('Migration check for catalog_technologies extra fields failed:', e.message);
  }

  // Defensive migration: catalog_packages — discount price, custom ribbon, custom button
  try {
    const cols = db.prepare("PRAGMA table_info(catalog_packages)").all();
    const extra = [
      ['discount_price', "ALTER TABLE catalog_packages ADD COLUMN discount_price INTEGER NOT NULL DEFAULT 0"],
      ['ribbon_text', "ALTER TABLE catalog_packages ADD COLUMN ribbon_text TEXT NOT NULL DEFAULT ''"],
      ['button_text', "ALTER TABLE catalog_packages ADD COLUMN button_text TEXT NOT NULL DEFAULT ''"],
      ['button_link', "ALTER TABLE catalog_packages ADD COLUMN button_link TEXT NOT NULL DEFAULT ''"]
    ];
    extra.forEach(([col, sql]) => { if (!cols.some(c => c.name === col)) db.exec(sql); });
    // Backfill ribbon_text for existing "Most Popular" packages so the visual doesn't change
    db.exec("UPDATE catalog_packages SET ribbon_text = 'Most Popular' WHERE is_popular = 1 AND (ribbon_text IS NULL OR ribbon_text = '')");
  } catch (e) {
    console.warn('Migration check for catalog_packages extra fields failed:', e.message);
  }

  // Seed default site-wide SEO settings if empty
  const seoDefaults = {
    default_meta_title: 'Mishty Web — Website Development, SEO & Digital Marketing Agency in Khargone, MP',
    default_meta_description: 'Mishty Web is a full-service digital agency in Khargone, Madhya Pradesh — custom website development, WordPress, Shopify, SEO, Google & Meta Ads, and branding, all built in-house.',
    default_og_image: '',
    default_keywords: 'website development, digital marketing, SEO, Google Ads, Meta Ads, Khargone, Madhya Pradesh',
    default_canonical: '',
    default_robots: 'index, follow',
    footer_logo_url: '',
    footer_description: 'Full-service digital marketing and web development agency based in Khargone, Madhya Pradesh.',
    footer_copyright: '© 2026 Mishty Web. All rights reserved.'
  };
  const seoStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(seoDefaults).forEach(([key, value]) => seoStmt.run(key, value));

  // Seed a default Hero Slide if empty — matches the wording that used to be
  // hardcoded on index.html, so turning this feature on changes nothing
  // visually until the admin edits or adds slides in Admin > Hero Slider.
  const heroCount = db.prepare('SELECT COUNT(*) AS c FROM hero_slides').get().c;
  if (heroCount === 0) {
    db.prepare(`INSERT INTO hero_slides
      (badge, heading, highlight, description, button1_text, button1_link, button2_text, button2_link,
       image_alt, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`)
      .run(
        'Full-service digital partner',
        'Digital marketing & web development that',
        'grows your business',
        'Mishty Web is a full-service digital agency based in Khargone — we build websites, run ad campaigns, and design brands for companies across travel, retail, recruitment, and manufacturing.',
        'Get Free Consultation →', 'contact.html',
        'View Our Work', 'gallery.html',
        'Mishty Web hero banner'
      );
  }

  // Seed FAQs if empty
  const faqCount = db.prepare('SELECT COUNT(*) AS c FROM faqs').get().c;
  if (faqCount === 0) {
    const faqs = [
      { question: 'What services does Mishty Web offer?', answer: 'We build websites (custom, WordPress, Shopify, WooCommerce), run Google Ads and Meta Ads campaigns, provide SEO, and design branding — all handled in-house by one team.', category: 'General' },
      { question: 'How long does a typical website take to build?', answer: 'Most business websites are delivered in 1–3 weeks depending on scope. Larger platforms with custom features can take longer — we confirm an exact timeline in your quotation.', category: 'General' },
      { question: 'Do you offer support after the website is delivered?', answer: 'Yes. Every project includes a support window after launch, and ongoing maintenance plans are available if you want us to keep managing updates and changes.', category: 'Support' },
      { question: 'Can I pay in installments?', answer: 'Most projects are billed with an advance and milestone-based payments as work progresses. Exact terms are shared in your quotation before work begins.', category: 'Payments' },
      { question: 'Do you work with businesses outside Khargone?', answer: 'Yes — while we\'re based in Khargone, Madhya Pradesh, we work with clients across India remotely, with the same direct developer access.', category: 'General' }
    ];
    const stmt = db.prepare('INSERT INTO faqs (question, answer, category, sort_order) VALUES (@question, @answer, @category, @order)');
    faqs.forEach((f, i) => stmt.run({ ...f, order: i }));
  }

  // Seed the Service Catalog (Category -> Technology -> Package) if empty
  seedCatalog(db);
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

function setSettings(pairs) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  Object.entries(pairs).forEach(([key, value]) => stmt.run(key, value == null ? '' : String(value)));
}

module.exports = { db, init, getSettings, setSettings };
