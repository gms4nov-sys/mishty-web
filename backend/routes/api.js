const express = require('express');
const { db, getSettings } = require('../db/init');
const { uploadDoc } = require('../middleware/upload');

const router = express.Router();

// Basic email format check — good enough to catch obvious junk/typos
// without rejecting valid addresses with unusual (but legal) formats.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

// Honeypot spam check: the public forms include a hidden field named
// "website" that a real visitor never sees or fills in — only bots that
// blindly fill every input do. If it has a value, silently pretend success
// so the bot doesn't learn to look for a different signal.
function isHoneypotTripped(req) {
  return !!(req.body && req.body.website);
}

/* ---------- SERVICE CATALOG (Category -> Technology -> Package) ---------- */

function parseTechnology(t) {
  return { ...t, gallery_images: JSON.parse(t.gallery_images || '[]'), features: JSON.parse(t.features || '[]') };
}

// All categories, each with its technologies nested (for the Services landing page)
router.get('/catalog', (req, res) => {
  const categories = db.prepare('SELECT * FROM catalog_categories ORDER BY sort_order ASC').all();
  const technologies = db.prepare("SELECT * FROM catalog_technologies WHERE status != 'inactive' ORDER BY sort_order ASC").all().map(parseTechnology);
  const result = categories.map(cat => ({
    ...cat,
    technologies: technologies.filter(t => t.category_id === cat.id)
  }));
  res.json(result);
});

// One category + its technologies (Service Catalog page)
router.get('/catalog/:categorySlug', (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE slug = ?').get(req.params.categorySlug);
  if (!category) return res.status(404).json({ ok: false, error: 'Category not found' });
  const technologies = db.prepare("SELECT * FROM catalog_technologies WHERE category_id = ? AND status != 'inactive' ORDER BY sort_order ASC").all(category.id).map(parseTechnology);
  res.json({ category, technologies });
});

// One technology + its packages (Package listing page)
router.get('/catalog/:categorySlug/:techSlug', (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE slug = ?').get(req.params.categorySlug);
  if (!category) return res.status(404).json({ ok: false, error: 'Category not found' });
  const technologyRow = db.prepare('SELECT * FROM catalog_technologies WHERE category_id = ? AND slug = ?').get(category.id, req.params.techSlug);
  if (!technologyRow) return res.status(404).json({ ok: false, error: 'Service not found' });
  const technology = parseTechnology(technologyRow);
  const packages = db.prepare('SELECT * FROM catalog_packages WHERE technology_id = ? ORDER BY sort_order ASC').all(technology.id)
    .map(p => ({ ...p, features: JSON.parse(p.features || '[]') }));
  res.json({ category, technology, packages });
});

// One package's full detail (used to prefill the read-only enquiry fields)
router.get('/catalog/:categorySlug/:techSlug/:packageTier', (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE slug = ?').get(req.params.categorySlug);
  if (!category) return res.status(404).json({ ok: false, error: 'Category not found' });
  const technology = db.prepare('SELECT * FROM catalog_technologies WHERE category_id = ? AND slug = ?').get(category.id, req.params.techSlug);
  if (!technology) return res.status(404).json({ ok: false, error: 'Service not found' });
  const pkg = db.prepare('SELECT * FROM catalog_packages WHERE technology_id = ? AND tier = ?').get(technology.id, req.params.packageTier);
  if (!pkg) return res.status(404).json({ ok: false, error: 'Package not found' });
  const allPackages = db.prepare('SELECT * FROM catalog_packages WHERE technology_id = ? ORDER BY sort_order ASC').all(technology.id)
    .map(p => ({ ...p, features: JSON.parse(p.features || '[]') }));
  res.json({ category, technology, package: { ...pkg, features: JSON.parse(pkg.features || '[]') }, allPackages });
});

// Submit an enquiry from the catalog/package flow (with optional file upload)
router.post('/enquiry', uploadDoc.single('attachment'), (req, res) => {
  const {
    category_slug, category_name, technology_slug, technology_name,
    package_tier, package_name, price, price_suffix,
    full_name, phone, email, company_name, country, budget, requirements
  } = req.body;

  if (isHoneypotTripped(req)) {
    return res.json({ ok: true, id: null }); // silently pretend success to bots
  }

  if (!full_name || !email) {
    return res.status(400).json({ ok: false, error: 'Full name and email are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address' });
  }

  const file_url = req.file ? '/uploads/' + req.file.filename : null;

  const info = db.prepare(`INSERT INTO enquiries
    (category_slug, category_name, technology_slug, technology_name, package_tier, package_name, price, price_suffix,
     full_name, phone, email, company_name, country, budget, requirements, file_url, source)
    VALUES (@category_slug, @category_name, @technology_slug, @technology_name, @package_tier, @package_name, @price, @price_suffix,
     @full_name, @phone, @email, @company_name, @country, @budget, @requirements, @file_url, @source)`)
    .run({
      category_slug: category_slug || '', category_name: category_name || '',
      technology_slug: technology_slug || '', technology_name: technology_name || '',
      package_tier: package_tier || '', package_name: package_name || '',
      price: parseInt(price, 10) || 0, price_suffix: price_suffix || '',
      full_name, phone: phone || '', email, company_name: company_name || '',
      country: country || '', budget: budget || '', requirements: requirements || '',
      file_url, source: 'website-catalog'
    });

  res.json({ ok: true, id: info.lastInsertRowid });
});

// Public site settings — used by the site's pages to show current phone, address,
// logo, payment details, etc. without needing to edit any HTML file.
router.get('/settings', (req, res) => {
  res.json(getSettings());
});

router.get('/pages', (req, res) => {
  const pages = db.prepare('SELECT id, slug, title, show_in_footer, sort_order FROM pages WHERE show_in_footer = 1 ORDER BY sort_order ASC').all();
  res.json(pages);
});

router.get('/pages/:slug', (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });
  res.json(page);
});

router.get('/gallery', (req, res) => {
  const items = db.prepare('SELECT * FROM gallery_items ORDER BY sort_order ASC').all()
    .map(it => ({ ...it, tech_stack: JSON.parse(it.tech_stack || '[]') }));
  res.json(items);
});

router.get('/blog', (req, res) => {
  const posts = db.prepare('SELECT id, slug, tag, title, excerpt, thumb_label, featured_image, read_time, author, published, created_at FROM blog_posts WHERE published = 1 ORDER BY sort_order ASC').all();
  res.json(posts);
});

router.get('/blog/:slug', (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
  res.json(post);
});

// Hero Slider — only active slides, within their schedule window if one is set
router.get('/hero-slides', (req, res) => {
  const rows = db.prepare('SELECT * FROM hero_slides WHERE is_active = 1 ORDER BY sort_order ASC').all();
  const now = new Date();
  const inWindow = (r) => {
    if (r.schedule_start && new Date(r.schedule_start) > now) return false;
    if (r.schedule_end && new Date(r.schedule_end) < now) return false;
    return true;
  };
  res.json(rows.filter(inWindow));
});

router.get('/faqs', (req, res) => {
  const faqs = db.prepare('SELECT id, question, answer, category FROM faqs WHERE is_active = 1 ORDER BY sort_order ASC').all();
  res.json(faqs);
});

router.get('/nav-items', (req, res) => {
  const location = req.query.location === 'footer' ? 'footer' : 'header';
  const items = db.prepare('SELECT id, label, url, open_new_tab FROM nav_items WHERE location = ? AND is_active = 1 ORDER BY sort_order ASC').all(location);
  res.json(items);
});

router.get('/testimonials', (req, res) => {
  const testimonials = db.prepare('SELECT * FROM testimonials ORDER BY sort_order ASC').all();
  res.json(testimonials);
});

router.get('/client-logos', (req, res) => {
  const logos = db.prepare('SELECT * FROM client_logos ORDER BY sort_order ASC').all();
  res.json(logos);
});

router.post('/contact', (req, res) => {
  const { name, phone, email, service, message } = req.body;
  if (isHoneypotTripped(req)) {
    return res.json({ ok: true }); // silently pretend success to bots
  }
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and email are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address' });
  }
  db.prepare('INSERT INTO messages (name, phone, email, service, message) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone || '', email, service || '', message || '');
  res.json({ ok: true });
});

module.exports = router;
