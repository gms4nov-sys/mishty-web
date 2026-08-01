// Seed data for the Service Catalog + Package Selection system.
// Structure: Category -> Technology/Service -> Package (Basic / Business / Premium)
// Everything here is fully editable afterwards from the Admin Panel (Catalog section) —
// this seed only gives the site real starting content instead of empty tables.

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Price bands + feature templates per "kind" of service, used to generate
// Basic / Business / Premium packages for every technology automatically.
const KIND_TEMPLATES = {
  website: {
    prices: [7999, 17999, 34999],
    suffix: 'one-time',
    delivery: ['5–7 days', '10–14 days', '18–25 days'],
    support: ['15 days free support', '30 days free support', '90 days priority support'],
    revisions: ['1 revision round', '3 revision rounds', 'Unlimited revisions'],
    features: (name) => [
      [`Up to 5 pages on ${name}`, 'Mobile-responsive design', 'Basic contact form', 'Standard SEO setup'],
      [`Up to 10 pages on ${name}`, 'Mobile-responsive premium design', 'Advanced contact & enquiry forms', 'On-page SEO optimisation', 'Google Analytics setup', 'Speed optimisation'],
      [`Unlimited pages on ${name}`, 'Fully custom premium design', 'Advanced forms & integrations', 'Advanced SEO + schema markup', 'Analytics + conversion tracking', 'Priority speed optimisation', 'Dedicated project manager']
    ]
  },
  ecommerce: {
    prices: [14999, 28999, 49999],
    suffix: 'one-time',
    delivery: ['10–14 days', '18–22 days', '25–35 days'],
    support: ['30 days free support', '60 days free support', '120 days priority support'],
    revisions: ['2 revision rounds', '4 revision rounds', 'Unlimited revisions'],
    features: (name) => [
      [`${name} setup with up to 30 products`, 'Payment gateway integration', 'Basic shipping setup', 'Mobile-optimised checkout'],
      [`${name} setup with up to 150 products`, 'Multiple payment gateways', 'Shipping & tax rules configured', 'Abandoned cart recovery', 'Product review app setup'],
      [`${name} setup with unlimited products`, 'Full payment & shipping suite', 'Advanced apps & automations', 'Multi-currency ready', 'Priority support & training', 'Dedicated project manager']
    ]
  },
  seo: {
    prices: [5999, 11999, 19999],
    suffix: '/month',
    delivery: ['Ongoing — monthly cycle', 'Ongoing — monthly cycle', 'Ongoing — monthly cycle'],
    support: ['Email support', 'Email + call support', 'Priority WhatsApp + call support'],
    revisions: ['Monthly report', 'Bi-weekly report', 'Weekly report'],
    features: (name) => [
      [`${name} — keyword research (15 keywords)`, 'On-page optimisation', 'Google Business Profile basics', 'Monthly ranking report'],
      [`${name} — keyword research (40 keywords)`, 'On-page + technical fixes', 'Off-page link building', 'Competitor analysis', 'Bi-weekly ranking report'],
      [`${name} — keyword research (80+ keywords)`, 'Full technical SEO audit & fixes', 'Aggressive off-page campaign', 'Content optimisation', 'Weekly reporting & strategy calls']
    ]
  },
  'ads-google': {
    prices: [6999, 13999, 22999],
    suffix: '/month + ad spend',
    delivery: ['Live within 3–4 days', 'Live within 3–4 days', 'Live within 2–3 days'],
    support: ['Email support', 'Email + call support', 'Priority WhatsApp + call support'],
    revisions: ['Monthly optimisation', 'Bi-weekly optimisation', 'Weekly optimisation'],
    features: (name) => [
      [`${name} campaign setup`, 'Conversion tracking setup', '1 campaign, up to 2 ad groups', 'Monthly performance report'],
      [`${name} campaign setup & scaling`, 'Advanced conversion tracking', 'Up to 4 campaigns', 'A/B testing of ad copy', 'Bi-weekly performance report'],
      [`${name} full-funnel strategy`, 'Advanced tracking + remarketing', 'Unlimited campaigns', 'Continuous A/B testing', 'Weekly strategy calls & reporting']
    ]
  },
  'ads-meta': {
    prices: [5999, 11999, 18999],
    suffix: '/month + ad spend',
    delivery: ['Live within 2–3 days', 'Live within 2–3 days', 'Live within 1–2 days'],
    support: ['Email support', 'Email + call support', 'Priority WhatsApp + call support'],
    revisions: ['Monthly optimisation', 'Bi-weekly optimisation', 'Weekly optimisation'],
    features: (name) => [
      [`${name} campaign setup`, 'Pixel & event tracking setup', '1 campaign, up to 2 ad sets', 'Monthly performance report'],
      [`${name} campaign setup & scaling`, 'Advanced pixel & CAPI setup', 'Up to 4 campaigns', 'Creative A/B testing', 'Bi-weekly performance report'],
      [`${name} full-funnel strategy`, 'Advanced tracking + retargeting', 'Unlimited campaigns', 'Continuous creative testing', 'Weekly strategy calls & reporting']
    ]
  },
  design: {
    prices: [2499, 5999, 9999],
    suffix: 'one-time',
    delivery: ['2–3 days', '4–5 days', '6–8 days'],
    support: ['7 days revisions window', '15 days revisions window', '30 days revisions window'],
    revisions: ['2 concepts, 2 revisions', '3 concepts, 4 revisions', 'Unlimited concepts & revisions'],
    features: (name) => [
      [`${name} — 2 initial concepts`, 'Standard file formats (JPG/PNG)', '2 rounds of revisions'],
      [`${name} — 3 initial concepts`, 'Print + web ready files (PDF/AI/PNG)', '4 rounds of revisions', 'Source files included'],
      [`${name} — unlimited concepts`, 'Full brand-consistent file kit', 'Unlimited revisions', 'Source files + style guide', 'Dedicated designer']
    ]
  },
  marketplace: {
    prices: [8999, 15999, 25999],
    suffix: '/month',
    delivery: ['Setup in 5–7 days', 'Setup in 4–6 days', 'Setup in 3–5 days'],
    support: ['Email support', 'Email + call support', 'Priority WhatsApp + call support'],
    revisions: ['Monthly catalog review', 'Bi-weekly catalog review', 'Weekly catalog review'],
    features: (name) => [
      [`${name} account setup & verification`, 'Up to 25 product listings', 'Basic listing optimisation', 'Monthly performance report'],
      [`${name} account setup & verification`, 'Up to 100 product listings', 'Keyword-optimised listings', 'Order & return support', 'Bi-weekly performance report'],
      [`${name} account setup & verification`, 'Unlimited product listings', 'Advanced listing + ad management', 'Priority order & return support', 'Weekly performance report & strategy calls']
    ]
  },
  app: {
    prices: [39999, 79999, 149999],
    suffix: 'one-time',
    delivery: ['3–4 weeks', '5–7 weeks', '8–12 weeks'],
    support: ['30 days free support', '60 days free support', '120 days priority support'],
    revisions: ['2 revision rounds', '4 revision rounds', 'Unlimited revisions'],
    features: (name) => [
      [`${name} — up to 6 screens`, 'Basic backend & API integration', 'Play/App Store submission assistance'],
      [`${name} — up to 15 screens`, 'Custom backend & API integration', 'Push notifications', 'Play/App Store submission & listing setup'],
      [`${name} — unlimited screens`, 'Advanced backend, APIs & 3rd-party integrations', 'Push notifications + analytics', 'Full store optimisation', 'Dedicated project manager']
    ]
  },
  software: {
    prices: [49999, 119999, 249999],
    suffix: 'one-time',
    delivery: ['3–5 weeks', '6–9 weeks', '10–16 weeks'],
    support: ['30 days free support', '60 days free support', '180 days priority support'],
    revisions: ['2 revision rounds', '4 revision rounds', 'Unlimited revisions'],
    features: (name) => [
      [`${name} — core modules only`, 'Single-user access', 'Basic reporting'],
      [`${name} — core + custom modules`, 'Multi-user access with roles', 'Advanced reporting & exports', 'Third-party integrations'],
      [`${name} — fully custom build`, 'Unlimited users with roles & permissions', 'Advanced analytics dashboard', 'Priority integrations & scaling support', 'Dedicated project manager']
    ]
  },
  marketing: {
    prices: [6999, 13999, 23999],
    suffix: '/month',
    delivery: ['Ongoing — monthly cycle', 'Ongoing — monthly cycle', 'Ongoing — monthly cycle'],
    support: ['Email support', 'Email + call support', 'Priority WhatsApp + call support'],
    revisions: ['Monthly content calendar', 'Bi-weekly content calendar', 'Weekly content calendar'],
    features: (name) => [
      [`${name} — 8 posts/month`, 'Basic content calendar', 'Monthly performance report'],
      [`${name} — 16 posts/month`, 'Planned content calendar + reels', 'Community engagement', 'Bi-weekly performance report'],
      [`${name} — 30 posts/month`, 'Full content calendar + reels + stories', 'Active community management', 'Weekly performance report & strategy calls']
    ]
  }
};

const TIER_META = [
  { tier: 'basic', name: 'Basic' },
  { tier: 'business', name: 'Business' },
  { tier: 'premium', name: 'Premium' }
];

function buildPackages(kind, techName) {
  const t = KIND_TEMPLATES[kind];
  const featureSets = t.features(techName);
  return TIER_META.map((meta, i) => ({
    tier: meta.tier,
    name: meta.name + ' ' + techName,
    price: t.prices[i],
    price_suffix: t.suffix,
    delivery_time: t.delivery[i],
    support_duration: t.support[i],
    revisions: t.revisions[i],
    features: featureSets[i],
    is_popular: meta.tier === 'business' ? 1 : 0
  }));
}

// Category -> icon, description, kind (pricing/feature template), technologies[]
const CATALOG = [
  {
    name: 'Website Development', icon: '🌐', kind: 'website',
    description: 'Custom-coded, WordPress, and business websites built to load fast and convert.',
    technologies: [
      { name: 'WordPress Website', description: 'A professional WordPress build with an easy-to-use editor.' },
      { name: 'Shopify Store', description: 'A Shopify storefront set up and themed to start selling fast.' },
      { name: 'Custom Coding Website', description: 'Hand-coded on React & Node.js — full ownership, no page builders.' },
      { name: 'Landing Page', description: 'A single high-converting page for a campaign, product, or launch.' },
      { name: 'Business Website', description: 'A multi-page site that presents your business professionally.' }
    ]
  },
  {
    name: 'E-Commerce Development', icon: '🛒', kind: 'ecommerce',
    description: 'Online stores built for real order volume — Shopify, WooCommerce, or fully custom.',
    technologies: [
      { name: 'Shopify E-commerce', description: 'Full Shopify store build with catalog, payments, and shipping.' },
      { name: 'WooCommerce Store', description: 'WordPress + WooCommerce store for flexible, self-managed selling.' },
      { name: 'Custom E-commerce', description: 'Fully custom-coded store built to your exact workflow.' },
      { name: 'Marketplace-Ready Store', description: 'A store built to also sync with Amazon, Flipkart & other marketplaces.' }
    ]
  },
  {
    name: 'SEO Services', icon: '📈', kind: 'seo',
    description: 'On-page, off-page, and technical SEO to move your business up the search results.',
    technologies: [
      { name: 'Local SEO', description: 'Rank higher for "near me" and city-specific searches.' },
      { name: 'Technical SEO', description: 'Fix crawl, speed, and structural issues holding your site back.' },
      { name: 'E-commerce SEO', description: 'SEO built specifically for product and category pages.' },
      { name: 'International SEO', description: 'SEO structured for multiple countries or languages.' }
    ]
  },
  {
    name: 'Google Ads', icon: '🎯', kind: 'ads-google',
    description: 'Search, Shopping, Display, Performance Max, and YouTube campaigns — set up and managed.',
    technologies: [
      { name: 'Search Ads', description: 'Capture customers actively searching for what you offer.' },
      { name: 'Shopping Ads', description: 'Put your products directly in front of ready-to-buy shoppers.' },
      { name: 'Display Ads', description: 'Build awareness across the web with visual banner campaigns.' },
      { name: 'Performance Max', description: 'AI-driven campaigns across all Google surfaces from one setup.' },
      { name: 'YouTube Ads', description: 'Video ad campaigns to build reach and consideration.' }
    ]
  },
  {
    name: 'Meta Ads', icon: '📣', kind: 'ads-meta',
    description: 'Facebook, Instagram, Lead Gen, and WhatsApp campaigns — created and optimised for results.',
    technologies: [
      { name: 'Facebook Ads', description: 'Reach and convert audiences across Facebook.' },
      { name: 'Instagram Ads', description: 'Visual campaigns built for Instagram feed, reels, and stories.' },
      { name: 'Lead Generation', description: 'In-platform lead forms built to fill your pipeline directly.' },
      { name: 'WhatsApp Campaign', description: 'Click-to-WhatsApp ads that start conversations instantly.' }
    ]
  },
  {
    name: 'Graphic Design', icon: '🎨', kind: 'design',
    description: 'Logos, banners, social creatives, and print design for a consistent brand identity.',
    technologies: [
      { name: 'Logo Design', description: 'A distinct, memorable logo built around your brand.' },
      { name: 'Banner Design', description: 'Web and print banners for promotions and campaigns.' },
      { name: 'Social Media Design', description: 'On-brand post and reel templates for consistent posting.' },
      { name: 'Business Card', description: 'Professional business card design, print-ready.' },
      { name: 'Brochure', description: 'Multi-fold brochure design for offline marketing.' }
    ]
  },
  {
    name: 'Marketplace Services', icon: '📦', kind: 'marketplace',
    description: 'Account setup, listing optimisation, and ongoing management across major marketplaces.',
    technologies: [
      { name: 'Amazon', description: 'Seller account setup, listings, and ongoing management on Amazon.' },
      { name: 'Flipkart', description: 'Seller account setup, listings, and ongoing management on Flipkart.' },
      { name: 'Meesho', description: 'Seller account setup, listings, and ongoing management on Meesho.' },
      { name: 'JioMart', description: 'Seller account setup, listings, and ongoing management on JioMart.' },
      { name: 'Myntra', description: 'Seller account setup, listings, and ongoing management on Myntra.' }
    ]
  },
  {
    name: 'Mobile App Development', icon: '📱', kind: 'app',
    description: 'Android, iOS, hybrid, and Flutter apps built from your requirements to store submission.',
    technologies: [
      { name: 'Android App', description: 'Native Android app development.' },
      { name: 'iOS App', description: 'Native iOS app development.' },
      { name: 'Hybrid App', description: 'One codebase, both Android and iOS, built for speed to market.' },
      { name: 'Flutter App', description: 'Cross-platform app built on Flutter for a native feel on both platforms.' }
    ]
  },
  {
    name: 'Software Development', icon: '💻', kind: 'software',
    description: 'Custom web apps, desktop tools, and internal systems built around how you work.',
    technologies: [
      { name: 'Web Application', description: 'Custom web app built on React and Node.js.' },
      { name: 'Desktop Application', description: 'Cross-platform desktop app (Electron-based).' },
      { name: 'ERP / CRM System', description: 'Custom ERP or CRM to run your business operations.' },
      { name: 'API Development', description: 'Custom APIs to connect your systems and apps together.' }
    ]
  },
  {
    name: 'Digital Marketing', icon: '📊', kind: 'marketing',
    description: 'Social media, content, email, and WhatsApp marketing that keeps your brand visible.',
    technologies: [
      { name: 'Social Media Marketing', description: 'Planned, designed, and posted content across your channels.' },
      { name: 'Content Marketing', description: 'Blog, video, and content strategy built to attract and convert.' },
      { name: 'Email Marketing', description: 'Newsletter and campaign emails that keep customers engaged.' },
      { name: 'Influencer Marketing', description: 'Influencer outreach and campaign management for your brand.' },
      { name: 'WhatsApp Marketing', description: 'Broadcast and automated WhatsApp campaigns for updates and offers.' }
    ]
  }
];

function seedCatalog(db) {
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM catalog_categories').get().c;
  if (catCount > 0) return; // already seeded — never overwrite admin's edits

  const insertCat = db.prepare('INSERT INTO catalog_categories (slug, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)');
  const insertTech = db.prepare('INSERT INTO catalog_technologies (category_id, slug, name, description, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const insertPkg = db.prepare('INSERT INTO catalog_packages (technology_id, tier, name, price, price_suffix, delivery_time, support_duration, revisions, features, is_popular, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  CATALOG.forEach((cat, ci) => {
    const catSlug = slugify(cat.name);
    const catInfo = insertCat.run(catSlug, cat.name, cat.description, cat.icon, ci);
    const categoryId = catInfo.lastInsertRowid;

    cat.technologies.forEach((tech, ti) => {
      const techSlug = slugify(tech.name);
      const techInfo = insertTech.run(categoryId, techSlug, tech.name, tech.description, cat.icon, ti);
      const technologyId = techInfo.lastInsertRowid;

      const packages = buildPackages(cat.kind, tech.name);
      packages.forEach((pkg, pi) => {
        insertPkg.run(
          technologyId, pkg.tier, pkg.name, pkg.price, pkg.price_suffix,
          pkg.delivery_time, pkg.support_duration, pkg.revisions,
          JSON.stringify(pkg.features), pkg.is_popular, pi
        );
      });
    });
  });
}

module.exports = { seedCatalog, slugify };
