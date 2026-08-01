const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, getSettings, setSettings } = require('../db/init');
const { requireLogin, requireAdminRole } = require('../middleware/auth');
const { upload, uploadDir, verifyImageContent, processImages, removeUploadedFileWithThumb } = require('../middleware/upload');
const { attachCsrfToken, verifyCsrfToken } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/rate-limit');

const router = express.Router();

// Every admin request gets a CSRF token attached (for forms to embed),
// and every state-changing admin request is checked against it.
router.use(attachCsrfToken);
router.use(verifyCsrfToken);
router.use((req, res, next) => {
  res.locals.currentAdminId = req.session.adminId;
  res.locals.currentAdminRole = req.session.role;
  res.locals.username = req.session.username;
  next();
});

// Delete an old uploaded file (best-effort, ignores errors) when it's replaced.
// Also cleans up its generated "-thumb.webp" companion from the image pipeline.
function removeUploadedFile(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  removeUploadedFileWithThumb(url);
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'page';
}

// One small config-driven set of routes covers "bulk delete / bulk status /
// duplicate / drag-drop reorder" for every simple list-style CMS module,
// instead of hand-writing near-identical routes five separate times.
// Registered early (before each resource's own /:id routes further down) so
// that literal paths like "/gallery/reorder" aren't swallowed by a later
// "/gallery/:id" route matching "reorder" as if it were an id.
const LIST_RESOURCES = {
  gallery: { table: 'gallery_items', imageCols: ['image_url'], statusCol: null, redirectTo: '/admin/gallery' },
  blog: { table: 'blog_posts', imageCols: ['featured_image'], statusCol: 'published', redirectTo: '/admin/blog' },
  testimonials: { table: 'testimonials', imageCols: ['avatar_url'], statusCol: null, redirectTo: '/admin/testimonials' },
  'client-logos': { table: 'client_logos', imageCols: ['logo_url'], statusCol: null, redirectTo: '/admin/client-logos' },
  faqs: { table: 'faqs', imageCols: [], statusCol: 'is_active', redirectTo: '/admin/faqs' },
  'hero-slides': { table: 'hero_slides', imageCols: ['desktop_image', 'mobile_image', 'bg_image', 'floating_image'], statusCol: 'is_active', redirectTo: '/admin/hero-slides' }
};

Object.keys(LIST_RESOURCES).forEach((key) => {
  const cfg = LIST_RESOURCES[key];

  // Bulk delete / activate / deactivate — checked rows come in as ids[]
  router.post('/' + key + '/bulk', requireLogin, (req, res) => {
    const ids = [].concat(req.body.ids || []).filter(Boolean);
    if (!ids.length) return res.redirect(cfg.redirectTo);
    const placeholders = ids.map(() => '?').join(',');

    if (req.body.action === 'delete') {
      if (cfg.imageCols.length) {
        const rows = db.prepare(`SELECT * FROM ${cfg.table} WHERE id IN (${placeholders})`).all(...ids);
        rows.forEach(row => cfg.imageCols.forEach(col => removeUploadedFile(row[col])));
      }
      db.prepare(`DELETE FROM ${cfg.table} WHERE id IN (${placeholders})`).run(...ids);
    } else if (req.body.action === 'activate' && cfg.statusCol) {
      db.prepare(`UPDATE ${cfg.table} SET ${cfg.statusCol} = 1 WHERE id IN (${placeholders})`).run(...ids);
    } else if (req.body.action === 'deactivate' && cfg.statusCol) {
      db.prepare(`UPDATE ${cfg.table} SET ${cfg.statusCol} = 0 WHERE id IN (${placeholders})`).run(...ids);
    }
    res.redirect(cfg.redirectTo);
  });

  // Duplicate a single row — copies every column except id, and appends
  // "(Copy)" to whichever text field looks like the title
  router.post('/' + key + '/:id/duplicate', requireLogin, (req, res) => {
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.redirect(cfg.redirectTo);
    const copy = { ...row };
    delete copy.id;
    ['title', 'name', 'question', 'client_name', 'heading'].forEach((field) => {
      if (copy[field] != null) copy[field] = copy[field] + ' (Copy)';
    });
    if (copy.slug) copy.slug = copy.slug + '-copy-' + Date.now();
    const maxOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM ${cfg.table}`).get().m;
    copy.sort_order = maxOrder + 1;
    const cols = Object.keys(copy);
    db.prepare(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`).run(copy);
    res.redirect(cfg.redirectTo);
  });

  // Drag-and-drop reorder — receives the full ordered list of ids after a drop
  router.post('/' + key + '/reorder', requireLogin, (req, res) => {
    const ids = req.body.ids || [];
    const upd = db.prepare(`UPDATE ${cfg.table} SET sort_order = ? WHERE id = ?`);
    ids.forEach((id, i) => upd.run(i, id));
    res.json({ ok: true });
  });
});

/* ---------- AUTH ---------- */
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.render('admin/login', { error: 'Invalid username or password' });
  }
  // Regenerate the session on login (session fixation protection) — issues a
  // fresh session ID so a token an attacker set before login can't be reused.
  const csrfToken = req.session.csrfToken;
  req.session.regenerate((err) => {
    if (err) return res.render('admin/login', { error: 'Something went wrong, please try again.' });
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    req.session.role = admin.role || 'admin';
    req.session.csrfToken = csrfToken;
    res.redirect('/admin');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

/* ---------- DASHBOARD ---------- */
router.get('/', requireLogin, (req, res) => {
  const stats = {
    gallery: db.prepare('SELECT COUNT(*) AS c FROM gallery_items').get().c,
    blog: db.prepare('SELECT COUNT(*) AS c FROM blog_posts').get().c,
    messages: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
    unread: db.prepare('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0').get().c,
    catalogCategories: db.prepare('SELECT COUNT(*) AS c FROM catalog_categories').get().c,
    enquiries: db.prepare('SELECT COUNT(*) AS c FROM enquiries').get().c,
    newEnquiries: db.prepare("SELECT COUNT(*) AS c FROM enquiries WHERE status = 'new'").get().c
  };
  const recentMessages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 5').all();
  const recentEnquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 5').all();
  res.render('admin/dashboard', { stats, recentMessages, recentEnquiries, username: req.session.username });
});

/* ---------- CATALOG: CATEGORIES ---------- */
router.get('/catalog', requireLogin, (req, res) => {
  const categories = db.prepare('SELECT * FROM catalog_categories ORDER BY sort_order ASC').all();
  const techCounts = db.prepare('SELECT category_id, COUNT(*) AS c FROM catalog_technologies GROUP BY category_id').all();
  const countMap = {};
  techCounts.forEach(r => { countMap[r.category_id] = r.c; });
  categories.forEach(c => { c.tech_count = countMap[c.id] || 0; });
  res.render('admin/catalog-categories', { categories });
});

router.get('/catalog/new', requireLogin, (req, res) => {
  res.render('admin/catalog-category-form', { category: null });
});

router.get('/catalog/:id/edit', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.redirect('/admin/catalog');
  res.render('admin/catalog-category-form', { category });
});

const categoryImageUpload = upload.fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'mobile_image', maxCount: 1 }
]);

router.post('/catalog', requireLogin, categoryImageUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { name, description, icon, image_alt, is_featured, seo_title, seo_description } = req.body;
  let slug = slugify(name);
  const existing = db.prepare('SELECT id FROM catalog_categories WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();
  const files = req.files || {};
  const cover_image = files.cover_image ? '/uploads/' + files.cover_image[0].filename : '';
  const mobile_image = files.mobile_image ? '/uploads/' + files.mobile_image[0].filename : '';
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM catalog_categories').get().m;
  db.prepare(`INSERT INTO catalog_categories
    (slug, name, description, icon, cover_image, mobile_image, image_alt, is_featured, seo_title, seo_description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(slug, name, description || '', icon || '🧩', cover_image, mobile_image, image_alt || '', is_featured ? 1 : 0,
      seo_title || '', seo_description || '', maxOrder + 1);
  res.redirect('/admin/catalog');
});

router.post('/catalog/:id', requireLogin, categoryImageUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { name, description, icon, image_alt, is_featured, seo_title, seo_description } = req.body;
  const existing = db.prepare('SELECT cover_image, mobile_image FROM catalog_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.redirect('/admin/catalog');
  const files = req.files || {};
  let cover_image = existing.cover_image, mobile_image = existing.mobile_image;
  if (files.cover_image) { removeUploadedFile(cover_image); cover_image = '/uploads/' + files.cover_image[0].filename; }
  if (files.mobile_image) { removeUploadedFile(mobile_image); mobile_image = '/uploads/' + files.mobile_image[0].filename; }
  db.prepare(`UPDATE catalog_categories SET
    name=?, description=?, icon=?, cover_image=?, mobile_image=?, image_alt=?, is_featured=?, seo_title=?, seo_description=?
    WHERE id=?`)
    .run(name, description || '', icon || '🧩', cover_image, mobile_image, image_alt || '', is_featured ? 1 : 0,
      seo_title || '', seo_description || '', req.params.id);
  res.redirect('/admin/catalog');
});

router.post('/catalog/:id/delete', requireLogin, (req, res) => {
  const techIds = db.prepare('SELECT id FROM catalog_technologies WHERE category_id = ?').all(req.params.id).map(t => t.id);
  const delPkg = db.prepare('DELETE FROM catalog_packages WHERE technology_id = ?');
  techIds.forEach(id => delPkg.run(id));
  db.prepare('DELETE FROM catalog_technologies WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM catalog_categories WHERE id = ?').run(req.params.id);
  res.redirect('/admin/catalog');
});

/* ---------- CATALOG: TECHNOLOGIES / SERVICES (nested under a category) ---------- */
router.get('/catalog/:categoryId/technologies', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  if (!category) return res.redirect('/admin/catalog');
  const technologies = db.prepare('SELECT * FROM catalog_technologies WHERE category_id = ? ORDER BY sort_order ASC').all(category.id);
  const pkgCounts = db.prepare('SELECT technology_id, COUNT(*) AS c FROM catalog_packages GROUP BY technology_id').all();
  const countMap = {};
  pkgCounts.forEach(r => { countMap[r.technology_id] = r.c; });
  technologies.forEach(t => { t.pkg_count = countMap[t.id] || 0; });
  res.render('admin/catalog-technologies', { category, technologies });
});

router.get('/catalog/:categoryId/technologies/new', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  if (!category) return res.redirect('/admin/catalog');
  res.render('admin/catalog-technology-form', { category, technology: null });
});

router.get('/catalog/:categoryId/technologies/:id/edit', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  if (!category) return res.redirect('/admin/catalog');
  const technology = db.prepare('SELECT * FROM catalog_technologies WHERE id = ?').get(req.params.id);
  if (!technology) return res.redirect('/admin/catalog/' + category.id + '/technologies');
  res.render('admin/catalog-technology-form', { category, technology });
});

const technologyUpload = upload.fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'mobile_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 10 }
]);

function readTechnologyBody(req) {
  const b = req.body;
  const featureArr = (b.features || '').split('\n').map(f => f.trim()).filter(Boolean);
  return {
    name: b.name, description: b.description || '', icon: b.icon || '',
    long_description: b.long_description || '', features: JSON.stringify(featureArr),
    cta_text: b.cta_text || '', cta_link: b.cta_link || '',
    buy_button_text: b.buy_button_text || '', whatsapp_message: b.whatsapp_message || '',
    status: b.status === 'inactive' ? 'inactive' : 'active',
    image_alt: b.image_alt || '', seo_title: b.seo_title || '', seo_description: b.seo_description || ''
  };
}

router.post('/catalog/:categoryId/technologies', requireLogin, technologyUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const data = readTechnologyBody(req);
  let slug = slugify(data.name);
  const existing = db.prepare('SELECT id FROM catalog_technologies WHERE category_id = ? AND slug = ?').get(req.params.categoryId, slug);
  if (existing) slug = slug + '-' + Date.now();
  const files = req.files || {};
  const cover_image = files.cover_image ? '/uploads/' + files.cover_image[0].filename : '';
  const mobile_image = files.mobile_image ? '/uploads/' + files.mobile_image[0].filename : '';
  const gallery_images = JSON.stringify((files.gallery_images || []).map(f => '/uploads/' + f.filename));
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM catalog_technologies WHERE category_id = ?').get(req.params.categoryId).m;
  db.prepare(`INSERT INTO catalog_technologies
    (category_id, slug, name, description, icon, cover_image, mobile_image, image_alt, gallery_images,
     long_description, features, cta_text, cta_link, buy_button_text, whatsapp_message, status, seo_title, seo_description, sort_order)
    VALUES (@category_id, @slug, @name, @description, @icon, @cover_image, @mobile_image, @image_alt, @gallery_images,
     @long_description, @features, @cta_text, @cta_link, @buy_button_text, @whatsapp_message, @status, @seo_title, @seo_description, @order)`)
    .run({ ...data, category_id: req.params.categoryId, slug, cover_image, mobile_image, gallery_images, order: maxOrder + 1 });
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies');
});

router.post('/catalog/:categoryId/technologies/:id', requireLogin, technologyUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const existing = db.prepare('SELECT * FROM catalog_technologies WHERE id = ?').get(req.params.id);
  if (!existing) return res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies');
  const data = readTechnologyBody(req);
  const files = req.files || {};
  let cover_image = existing.cover_image, mobile_image = existing.mobile_image;
  if (files.cover_image) { removeUploadedFile(cover_image); cover_image = '/uploads/' + files.cover_image[0].filename; }
  if (files.mobile_image) { removeUploadedFile(mobile_image); mobile_image = '/uploads/' + files.mobile_image[0].filename; }
  let gallery_images = existing.gallery_images;
  if (files.gallery_images && files.gallery_images.length) {
    // New gallery uploads replace the previous set (old files removed to avoid orphaning disk space)
    JSON.parse(existing.gallery_images || '[]').forEach(removeUploadedFile);
    gallery_images = JSON.stringify(files.gallery_images.map(f => '/uploads/' + f.filename));
  }
  db.prepare(`UPDATE catalog_technologies SET
    name=@name, description=@description, icon=@icon, cover_image=@cover_image, mobile_image=@mobile_image,
    image_alt=@image_alt, gallery_images=@gallery_images, long_description=@long_description, features=@features,
    cta_text=@cta_text, cta_link=@cta_link, buy_button_text=@buy_button_text, whatsapp_message=@whatsapp_message,
    status=@status, seo_title=@seo_title, seo_description=@seo_description
    WHERE id=@id`)
    .run({ ...data, cover_image, mobile_image, gallery_images, id: req.params.id });
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies');
});

router.post('/catalog/:categoryId/technologies/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT cover_image, mobile_image, gallery_images FROM catalog_technologies WHERE id = ?').get(req.params.id);
  if (existing) {
    removeUploadedFile(existing.cover_image);
    removeUploadedFile(existing.mobile_image);
    JSON.parse(existing.gallery_images || '[]').forEach(removeUploadedFile);
  }
  db.prepare('DELETE FROM catalog_packages WHERE technology_id = ?').run(req.params.id);
  db.prepare('DELETE FROM catalog_technologies WHERE id = ?').run(req.params.id);
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies');
});

/* ---------- CATALOG: PACKAGES (nested under a technology) ---------- */
router.get('/catalog/:categoryId/technologies/:techId/packages', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  const technology = db.prepare('SELECT * FROM catalog_technologies WHERE id = ?').get(req.params.techId);
  if (!category || !technology) return res.redirect('/admin/catalog');
  const packages = db.prepare('SELECT * FROM catalog_packages WHERE technology_id = ? ORDER BY sort_order ASC').all(technology.id);
  res.render('admin/catalog-packages', { category, technology, packages });
});

router.get('/catalog/:categoryId/technologies/:techId/packages/new', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  const technology = db.prepare('SELECT * FROM catalog_technologies WHERE id = ?').get(req.params.techId);
  if (!category || !technology) return res.redirect('/admin/catalog');
  const usedTiers = db.prepare('SELECT tier FROM catalog_packages WHERE technology_id = ?').all(technology.id).map(r => r.tier);
  res.render('admin/catalog-package-form', { category, technology, pkg: null, usedTiers });
});

router.get('/catalog/:categoryId/technologies/:techId/packages/:id/edit', requireLogin, (req, res) => {
  const category = db.prepare('SELECT * FROM catalog_categories WHERE id = ?').get(req.params.categoryId);
  const technology = db.prepare('SELECT * FROM catalog_technologies WHERE id = ?').get(req.params.techId);
  if (!category || !technology) return res.redirect('/admin/catalog');
  const pkg = db.prepare('SELECT * FROM catalog_packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.redirect('/admin/catalog/' + category.id + '/technologies/' + technology.id + '/packages');
  res.render('admin/catalog-package-form', { category, technology, pkg, usedTiers: [] });
});

router.post('/catalog/:categoryId/technologies/:techId/packages', requireLogin, (req, res) => {
  const { tier, name, price, discount_price, price_suffix, delivery_time, support_duration, revisions, features, is_popular, ribbon_text, button_text, button_link } = req.body;
  const featureArr = (features || '').split('\n').map(f => f.trim()).filter(Boolean);
  const finalRibbon = ribbon_text != null && ribbon_text.trim() ? ribbon_text.trim() : (is_popular ? 'Most Popular' : '');
  const existing = db.prepare('SELECT id FROM catalog_packages WHERE technology_id = ? AND tier = ?').get(req.params.techId, tier);
  if (existing) {
    db.prepare('UPDATE catalog_packages SET name=?, price=?, discount_price=?, price_suffix=?, delivery_time=?, support_duration=?, revisions=?, features=?, is_popular=?, ribbon_text=?, button_text=?, button_link=? WHERE id=?')
      .run(name, parseInt(price, 10) || 0, parseInt(discount_price, 10) || 0, price_suffix || '', delivery_time || '', support_duration || '', revisions || '', JSON.stringify(featureArr), is_popular ? 1 : 0, finalRibbon, button_text || '', button_link || '', existing.id);
  } else {
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM catalog_packages WHERE technology_id = ?').get(req.params.techId).m;
    db.prepare('INSERT INTO catalog_packages (technology_id, tier, name, price, discount_price, price_suffix, delivery_time, support_duration, revisions, features, is_popular, ribbon_text, button_text, button_link, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.techId, tier, name, parseInt(price, 10) || 0, parseInt(discount_price, 10) || 0, price_suffix || '', delivery_time || '', support_duration || '', revisions || '', JSON.stringify(featureArr), is_popular ? 1 : 0, finalRibbon, button_text || '', button_link || '', maxOrder + 1);
  }
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies/' + req.params.techId + '/packages');
});

router.post('/catalog/:categoryId/technologies/:techId/packages/:id', requireLogin, (req, res) => {
  const { name, price, discount_price, price_suffix, delivery_time, support_duration, revisions, features, is_popular, ribbon_text, button_text, button_link } = req.body;
  const featureArr = (features || '').split('\n').map(f => f.trim()).filter(Boolean);
  const finalRibbon = ribbon_text != null && ribbon_text.trim() ? ribbon_text.trim() : (is_popular ? 'Most Popular' : '');
  db.prepare('UPDATE catalog_packages SET name=?, price=?, discount_price=?, price_suffix=?, delivery_time=?, support_duration=?, revisions=?, features=?, is_popular=?, ribbon_text=?, button_text=?, button_link=? WHERE id=?')
    .run(name, parseInt(price, 10) || 0, parseInt(discount_price, 10) || 0, price_suffix || '', delivery_time || '', support_duration || '', revisions || '', JSON.stringify(featureArr), is_popular ? 1 : 0, finalRibbon, button_text || '', button_link || '', req.params.id);
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies/' + req.params.techId + '/packages');
});

router.post('/catalog/:categoryId/technologies/:techId/packages/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM catalog_packages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/catalog/' + req.params.categoryId + '/technologies/' + req.params.techId + '/packages');
});

/* ---------- ENQUIRIES (leads from the Service Catalog + Package flow) ---------- */
router.get('/enquiries', requireLogin, (req, res) => {
  const perPage = 20;
  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM enquiries').get().c;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
  const enquiries = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ? OFFSET ?').all(perPage, (page - 1) * perPage);
  res.render('admin/enquiries', { enquiries, pagination: { page, totalPages, totalCount } });
});

router.post('/enquiries/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE enquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/admin/enquiries');
});

router.post('/enquiries/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM enquiries WHERE id = ?').run(req.params.id);
  res.redirect('/admin/enquiries');
});

/* ---------- GALLERY ---------- */
router.get('/gallery', requireLogin, (req, res) => {
  const items = db.prepare('SELECT * FROM gallery_items ORDER BY sort_order ASC').all();
  res.render('admin/gallery', { items });
});

router.get('/gallery/new', requireLogin, (req, res) => {
  res.render('admin/gallery-form', { item: null });
});

router.get('/gallery/:id/edit', requireLogin, (req, res) => {
  const item = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/gallery');
  res.render('admin/gallery-form', { item });
});

router.post('/gallery', requireLogin, upload.single('image'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { category, category_label, title, description, project_url, tech_stack } = req.body;
  const image_url = req.file ? '/uploads/' + req.file.filename : null;
  const techArr = (tech_stack || '').split(',').map(t => t.trim()).filter(Boolean);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM gallery_items').get().m;
  db.prepare('INSERT INTO gallery_items (category, category_label, title, description, image_url, project_url, tech_stack, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(category, category_label, title, description, image_url, project_url || '', JSON.stringify(techArr), maxOrder + 1);
  res.redirect('/admin/gallery');
});

router.post('/gallery/:id', requireLogin, upload.single('image'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { category, category_label, title, description, project_url, tech_stack } = req.body;
  const techArr = (tech_stack || '').split(',').map(t => t.trim()).filter(Boolean);
  const existing = db.prepare('SELECT image_url FROM gallery_items WHERE id = ?').get(req.params.id);
  let image_url = existing ? existing.image_url : null;
  if (req.file) {
    removeUploadedFile(image_url);
    image_url = '/uploads/' + req.file.filename;
  }
  db.prepare('UPDATE gallery_items SET category=?, category_label=?, title=?, description=?, image_url=?, project_url=?, tech_stack=? WHERE id=?')
    .run(category, category_label, title, description, image_url, project_url || '', JSON.stringify(techArr), req.params.id);
  res.redirect('/admin/gallery');
});

router.post('/gallery/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT image_url FROM gallery_items WHERE id = ?').get(req.params.id);
  if (existing) removeUploadedFile(existing.image_url);
  db.prepare('DELETE FROM gallery_items WHERE id = ?').run(req.params.id);
  res.redirect('/admin/gallery');
});

/* ---------- BLOG ---------- */
router.get('/blog', requireLogin, (req, res) => {
  const posts = db.prepare('SELECT * FROM blog_posts ORDER BY sort_order ASC').all();
  res.render('admin/blog', { posts });
});

router.get('/blog/new', requireLogin, (req, res) => {
  res.render('admin/blog-form', { post: null });
});

router.get('/blog/:id/edit', requireLogin, (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.redirect('/admin/blog');
  res.render('admin/blog-form', { post });
});

router.post('/blog', requireLogin, upload.single('featured_image'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { tag, title, excerpt, content, thumb_label, read_time, author, published,
    meta_title, meta_description, meta_keywords, slug: customSlug } = req.body;
  let slug = (customSlug && customSlug.trim()) ? slugify(customSlug) : slugify(title);
  const existing = db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();
  const featured_image = req.file ? '/uploads/' + req.file.filename : '';
  const minOrder = db.prepare('SELECT COALESCE(MIN(sort_order), 1) AS m FROM blog_posts').get().m;
  db.prepare(`INSERT INTO blog_posts
    (slug, tag, title, excerpt, content, thumb_label, featured_image, meta_title, meta_description, meta_keywords, read_time, author, published, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(slug, tag, title, excerpt, content || '', thumb_label, featured_image,
      meta_title || '', meta_description || '', meta_keywords || '', read_time || '5 min read', author || 'Mishty Web', published ? 1 : 0, minOrder - 1);
  res.redirect('/admin/blog');
});

router.post('/blog/:id', requireLogin, upload.single('featured_image'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { tag, title, excerpt, content, thumb_label, read_time, author, published,
    meta_title, meta_description, meta_keywords, slug: customSlug } = req.body;
  const existing = db.prepare('SELECT slug, featured_image FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!existing) return res.redirect('/admin/blog');

  let slug = (customSlug && customSlug.trim()) ? slugify(customSlug) : existing.slug;
  if (slug !== existing.slug) {
    const clash = db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?').get(slug, req.params.id);
    if (clash) slug = slug + '-' + Date.now();
  }

  let featured_image = existing.featured_image;
  if (req.file) {
    removeUploadedFile(existing.featured_image);
    featured_image = '/uploads/' + req.file.filename;
  }

  db.prepare(`UPDATE blog_posts SET
    slug=?, tag=?, title=?, excerpt=?, content=?, thumb_label=?, featured_image=?,
    meta_title=?, meta_description=?, meta_keywords=?, read_time=?, author=?, published=?
    WHERE id=?`)
    .run(slug, tag, title, excerpt, content || '', thumb_label, featured_image,
      meta_title || '', meta_description || '', meta_keywords || '', read_time, author, published ? 1 : 0, req.params.id);
  res.redirect('/admin/blog');
});

router.post('/blog/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT featured_image FROM blog_posts WHERE id = ?').get(req.params.id);
  if (existing) removeUploadedFile(existing.featured_image);
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  res.redirect('/admin/blog');
});

/* ---------- MESSAGES ---------- */
router.get('/messages', requireLogin, (req, res) => {
  const perPage = 20;
  const totalCount = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?').all(perPage, (page - 1) * perPage);
  res.render('admin/messages', { messages, pagination: { page, totalPages, totalCount } });
});

router.post('/messages/:id/read', requireLogin, (req, res) => {
  db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

/* ---------- PAGES (Privacy Policy, Terms, Refund Policy, Disclaimer, etc.) ---------- */
router.get('/pages', requireLogin, (req, res) => {
  const pages = db.prepare('SELECT * FROM pages ORDER BY sort_order ASC').all();
  res.render('admin/pages', { pages });
});

router.get('/pages/new', requireLogin, (req, res) => {
  res.render('admin/page-form', { page: null, error: null });
});

router.get('/pages/:id/edit', requireLogin, (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.redirect('/admin/pages');
  res.render('admin/page-form', { page, error: null });
});

router.post('/pages', requireLogin, (req, res) => {
  const { title, content, show_in_footer } = req.body;
  const slug = slugify(title);
  const existing = db.prepare('SELECT id FROM pages WHERE slug = ?').get(slug);
  if (existing) {
    return res.render('admin/page-form', { page: { title, content, show_in_footer }, error: 'A page with a similar title/URL already exists. Please choose a different title.' });
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM pages').get().m;
  db.prepare('INSERT INTO pages (slug, title, content, show_in_footer, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))')
    .run(slug, title, content || '', show_in_footer ? 1 : 0, maxOrder + 1);
  res.redirect('/admin/pages');
});

router.post('/pages/:id', requireLogin, (req, res) => {
  const { title, content, show_in_footer } = req.body;
  db.prepare('UPDATE pages SET title=?, content=?, show_in_footer=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(title, content || '', show_in_footer ? 1 : 0, req.params.id);
  res.redirect('/admin/pages');
});

router.post('/pages/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/pages');
});

/* ---------- TESTIMONIALS ---------- */
router.get('/testimonials', requireLogin, (req, res) => {
  const testimonials = db.prepare('SELECT * FROM testimonials ORDER BY sort_order ASC').all();
  res.render('admin/testimonials', { testimonials });
});

router.get('/testimonials/new', requireLogin, (req, res) => {
  res.render('admin/testimonial-form', { testimonial: null });
});

router.get('/testimonials/:id/edit', requireLogin, (req, res) => {
  const testimonial = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!testimonial) return res.redirect('/admin/testimonials');
  res.render('admin/testimonial-form', { testimonial });
});

router.post('/testimonials', requireLogin, upload.single('avatar'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { client_name, client_role, quote, rating } = req.body;
  const avatar_url = req.file ? '/uploads/' + req.file.filename : null;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM testimonials').get().m;
  db.prepare('INSERT INTO testimonials (client_name, client_role, quote, rating, avatar_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(client_name, client_role || '', quote, parseInt(rating, 10) || 5, avatar_url, maxOrder + 1);
  res.redirect('/admin/testimonials');
});

router.post('/testimonials/:id', requireLogin, upload.single('avatar'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { client_name, client_role, quote, rating } = req.body;
  const existing = db.prepare('SELECT avatar_url FROM testimonials WHERE id = ?').get(req.params.id);
  let avatar_url = existing ? existing.avatar_url : null;
  if (req.file) {
    removeUploadedFile(avatar_url);
    avatar_url = '/uploads/' + req.file.filename;
  }
  db.prepare('UPDATE testimonials SET client_name=?, client_role=?, quote=?, rating=?, avatar_url=? WHERE id=?')
    .run(client_name, client_role || '', quote, parseInt(rating, 10) || 5, avatar_url, req.params.id);
  res.redirect('/admin/testimonials');
});

router.post('/testimonials/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT avatar_url FROM testimonials WHERE id = ?').get(req.params.id);
  if (existing) removeUploadedFile(existing.avatar_url);
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  res.redirect('/admin/testimonials');
});

/* ---------- CLIENT LOGOS ---------- */
router.get('/client-logos', requireLogin, (req, res) => {
  const logos = db.prepare('SELECT * FROM client_logos ORDER BY sort_order ASC').all();
  res.render('admin/client-logos', { logos });
});

router.post('/client-logos', requireLogin, upload.single('logo'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  if (!req.file) return res.redirect('/admin/client-logos');
  const { name } = req.body;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM client_logos').get().m;
  db.prepare('INSERT INTO client_logos (name, logo_url, sort_order) VALUES (?, ?, ?)')
    .run(name || 'Client', '/uploads/' + req.file.filename, maxOrder + 1);
  res.redirect('/admin/client-logos');
});

router.post('/client-logos/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT logo_url FROM client_logos WHERE id = ?').get(req.params.id);
  if (existing) removeUploadedFile(existing.logo_url);
  db.prepare('DELETE FROM client_logos WHERE id = ?').run(req.params.id);
  res.redirect('/admin/client-logos');
});

/* ---------- HERO SLIDER ---------- */
router.get('/hero-slides', requireLogin, (req, res) => {
  const slides = db.prepare('SELECT * FROM hero_slides ORDER BY sort_order ASC').all();
  res.render('admin/hero-slides', { slides });
});

router.get('/hero-slides/new', requireLogin, (req, res) => {
  res.render('admin/hero-slide-form', { slide: null });
});

router.get('/hero-slides/:id/edit', requireLogin, (req, res) => {
  const slide = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
  if (!slide) return res.redirect('/admin/hero-slides');
  res.render('admin/hero-slide-form', { slide });
});

const heroSlideUpload = upload.fields([
  { name: 'desktop_image', maxCount: 1 },
  { name: 'mobile_image', maxCount: 1 },
  { name: 'bg_image', maxCount: 1 },
  { name: 'floating_image', maxCount: 1 }
]);

function readHeroSlideBody(req) {
  const b = req.body;
  return {
    badge: b.badge || '', heading: b.heading, highlight: b.highlight || '', description: b.description || '',
    button1_text: b.button1_text || '', button1_link: b.button1_link || '',
    button2_text: b.button2_text || '', button2_link: b.button2_link || '',
    image_alt: b.image_alt || '', rating: b.rating || '', projects_count: b.projects_count || '',
    happy_clients: b.happy_clients || '', experience: b.experience || '',
    seo_title: b.seo_title || '', seo_description: b.seo_description || '',
    is_active: b.is_active ? 1 : 0, autoplay: b.autoplay ? 1 : 0,
    delay_ms: parseInt(b.delay_ms, 10) || 6000, animation: b.animation || 'fade-up', transition: b.transition || 'fade',
    schedule_start: b.schedule_start || '', schedule_end: b.schedule_end || ''
  };
}

router.post('/hero-slides', requireLogin, heroSlideUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const data = readHeroSlideBody(req);
  const files = req.files || {};
  data.desktop_image = files.desktop_image ? '/uploads/' + files.desktop_image[0].filename : '';
  data.mobile_image = files.mobile_image ? '/uploads/' + files.mobile_image[0].filename : '';
  data.bg_image = files.bg_image ? '/uploads/' + files.bg_image[0].filename : '';
  data.floating_image = files.floating_image ? '/uploads/' + files.floating_image[0].filename : '';
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM hero_slides').get().m;
  db.prepare(`INSERT INTO hero_slides
    (badge, heading, highlight, description, button1_text, button1_link, button2_text, button2_link,
     desktop_image, mobile_image, bg_image, floating_image, image_alt, rating, projects_count, happy_clients, experience,
     seo_title, seo_description, is_active, autoplay, delay_ms, animation, transition, schedule_start, schedule_end, sort_order)
    VALUES (@badge, @heading, @highlight, @description, @button1_text, @button1_link, @button2_text, @button2_link,
     @desktop_image, @mobile_image, @bg_image, @floating_image, @image_alt, @rating, @projects_count, @happy_clients, @experience,
     @seo_title, @seo_description, @is_active, @autoplay, @delay_ms, @animation, @transition, @schedule_start, @schedule_end, @order)`)
    .run({ ...data, order: maxOrder + 1 });
  res.redirect('/admin/hero-slides');
});

router.post('/hero-slides/:id', requireLogin, heroSlideUpload, verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const existing = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
  if (!existing) return res.redirect('/admin/hero-slides');
  const data = readHeroSlideBody(req);
  const files = req.files || {};
  ['desktop_image', 'mobile_image', 'bg_image', 'floating_image'].forEach((field) => {
    if (files[field]) {
      removeUploadedFile(existing[field]);
      data[field] = '/uploads/' + files[field][0].filename;
    } else {
      data[field] = existing[field];
    }
  });
  db.prepare(`UPDATE hero_slides SET
    badge=@badge, heading=@heading, highlight=@highlight, description=@description,
    button1_text=@button1_text, button1_link=@button1_link, button2_text=@button2_text, button2_link=@button2_link,
    desktop_image=@desktop_image, mobile_image=@mobile_image, bg_image=@bg_image, floating_image=@floating_image,
    image_alt=@image_alt, rating=@rating, projects_count=@projects_count, happy_clients=@happy_clients, experience=@experience,
    seo_title=@seo_title, seo_description=@seo_description, is_active=@is_active, autoplay=@autoplay, delay_ms=@delay_ms,
    animation=@animation, transition=@transition, schedule_start=@schedule_start, schedule_end=@schedule_end
    WHERE id=@id`)
    .run({ ...data, id: req.params.id });
  res.redirect('/admin/hero-slides');
});

router.post('/hero-slides/:id/toggle', requireLogin, (req, res) => {
  const slide = db.prepare('SELECT is_active FROM hero_slides WHERE id = ?').get(req.params.id);
  if (slide) db.prepare('UPDATE hero_slides SET is_active = ? WHERE id = ?').run(slide.is_active ? 0 : 1, req.params.id);
  res.redirect('/admin/hero-slides');
});

router.post('/hero-slides/:id/move/:dir', requireLogin, (req, res) => {
  const slides = db.prepare('SELECT id, sort_order FROM hero_slides ORDER BY sort_order ASC').all();
  const idx = slides.findIndex(s => String(s.id) === req.params.id);
  const swapWith = req.params.dir === 'up' ? idx - 1 : idx + 1;
  if (idx !== -1 && swapWith >= 0 && swapWith < slides.length) {
    const a = slides[idx], b = slides[swapWith];
    const upd = db.prepare('UPDATE hero_slides SET sort_order = ? WHERE id = ?');
    upd.run(b.sort_order, a.id);
    upd.run(a.sort_order, b.id);
  }
  res.redirect('/admin/hero-slides');
});

router.post('/hero-slides/:id/delete', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
  if (existing) ['desktop_image', 'mobile_image', 'bg_image', 'floating_image'].forEach(f => removeUploadedFile(existing[f]));
  db.prepare('DELETE FROM hero_slides WHERE id = ?').run(req.params.id);
  res.redirect('/admin/hero-slides');
});

/* ---------- FAQs ---------- */
router.get('/faqs', requireLogin, (req, res) => {
  const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC').all();
  res.render('admin/faqs', { faqs });
});

router.get('/faqs/new', requireLogin, (req, res) => {
  res.render('admin/faq-form', { faq: null });
});

router.get('/faqs/:id/edit', requireLogin, (req, res) => {
  const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  if (!faq) return res.redirect('/admin/faqs');
  res.render('admin/faq-form', { faq });
});

router.post('/faqs', requireLogin, (req, res) => {
  const { question, answer, category, is_active } = req.body;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM faqs').get().m;
  db.prepare('INSERT INTO faqs (question, answer, category, is_active, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(question, answer, category || 'General', is_active ? 1 : 0, maxOrder + 1);
  res.redirect('/admin/faqs');
});

router.post('/faqs/:id', requireLogin, (req, res) => {
  const { question, answer, category, is_active } = req.body;
  db.prepare('UPDATE faqs SET question=?, answer=?, category=?, is_active=? WHERE id=?')
    .run(question, answer, category || 'General', is_active ? 1 : 0, req.params.id);
  res.redirect('/admin/faqs');
});

router.post('/faqs/:id/move/:dir', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT id, sort_order FROM faqs ORDER BY sort_order ASC').all();
  const idx = rows.findIndex(s => String(s.id) === req.params.id);
  const swapWith = req.params.dir === 'up' ? idx - 1 : idx + 1;
  if (idx !== -1 && swapWith >= 0 && swapWith < rows.length) {
    const a = rows[idx], b = rows[swapWith];
    const upd = db.prepare('UPDATE faqs SET sort_order = ? WHERE id = ?');
    upd.run(b.sort_order, a.id);
    upd.run(a.sort_order, b.id);
  }
  res.redirect('/admin/faqs');
});

router.post('/faqs/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  res.redirect('/admin/faqs');
});

/* ---------- NAVIGATION ---------- */
router.get('/nav-items', requireLogin, (req, res) => {
  const headerItems = db.prepare("SELECT * FROM nav_items WHERE location = 'header' ORDER BY sort_order ASC").all();
  const footerItems = db.prepare("SELECT * FROM nav_items WHERE location = 'footer' ORDER BY sort_order ASC").all();
  res.render('admin/nav-items', { headerItems, footerItems });
});

router.get('/nav-items/new', requireLogin, (req, res) => {
  res.render('admin/nav-item-form', { navItem: null, defaultLocation: req.query.location === 'footer' ? 'footer' : 'header' });
});

router.get('/nav-items/:id/edit', requireLogin, (req, res) => {
  const navItem = db.prepare('SELECT * FROM nav_items WHERE id = ?').get(req.params.id);
  if (!navItem) return res.redirect('/admin/nav-items');
  res.render('admin/nav-item-form', { navItem, defaultLocation: navItem.location });
});

router.post('/nav-items', requireLogin, (req, res) => {
  const { location, label, url, is_active, open_new_tab } = req.body;
  const loc = location === 'footer' ? 'footer' : 'header';
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM nav_items WHERE location = ?').get(loc).m;
  db.prepare('INSERT INTO nav_items (location, label, url, is_active, open_new_tab, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(loc, label, url, is_active ? 1 : 0, open_new_tab ? 1 : 0, maxOrder + 1);
  res.redirect('/admin/nav-items');
});

router.post('/nav-items/:id', requireLogin, (req, res) => {
  const { label, url, is_active, open_new_tab } = req.body;
  db.prepare('UPDATE nav_items SET label=?, url=?, is_active=?, open_new_tab=? WHERE id=?')
    .run(label, url, is_active ? 1 : 0, open_new_tab ? 1 : 0, req.params.id);
  res.redirect('/admin/nav-items');
});

router.post('/nav-items/:id/move/:dir', requireLogin, (req, res) => {
  const navItem = db.prepare('SELECT * FROM nav_items WHERE id = ?').get(req.params.id);
  if (!navItem) return res.redirect('/admin/nav-items');
  const rows = db.prepare('SELECT id, sort_order FROM nav_items WHERE location = ? ORDER BY sort_order ASC').all(navItem.location);
  const idx = rows.findIndex(s => String(s.id) === req.params.id);
  const swapWith = req.params.dir === 'up' ? idx - 1 : idx + 1;
  if (idx !== -1 && swapWith >= 0 && swapWith < rows.length) {
    const a = rows[idx], b = rows[swapWith];
    const upd = db.prepare('UPDATE nav_items SET sort_order = ? WHERE id = ?');
    upd.run(b.sort_order, a.id);
    upd.run(a.sort_order, b.id);
  }
  res.redirect('/admin/nav-items');
});

router.post('/nav-items/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM nav_items WHERE id = ?').run(req.params.id);
  res.redirect('/admin/nav-items');
});

/* ---------- ADMIN USERS (role management) ---------- */
router.get('/users', requireLogin, requireAdminRole, (req, res) => {
  const users = db.prepare('SELECT id, username, role FROM admins ORDER BY id ASC').all();
  res.render('admin/users', { users, error: null, success: null });
});

router.post('/users', requireLogin, requireAdminRole, (req, res) => {
  const { username, password, role } = req.body;
  const users = db.prepare('SELECT id, username, role FROM admins ORDER BY id ASC').all();
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return res.render('admin/users', { users, error: 'That username is already taken.', success: null });
  }
  if (!password || password.length < 8) {
    return res.render('admin/users', { users, error: 'Password must be at least 8 characters.', success: null });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, role === 'editor' ? 'editor' : 'admin');
  res.redirect('/admin/users');
});

router.post('/users/:id/role', requireLogin, requireAdminRole, (req, res) => {
  const { role } = req.body;
  // Guard against locking yourself (or the last admin) out entirely
  if (String(req.params.id) === String(req.session.adminId) && role !== 'admin') {
    const users = db.prepare('SELECT id, username, role FROM admins ORDER BY id ASC').all();
    return res.render('admin/users', { users, error: "You can't remove your own Admin access.", success: null });
  }
  db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role === 'editor' ? 'editor' : 'admin', req.params.id);
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', requireLogin, requireAdminRole, (req, res) => {
  if (String(req.params.id) === String(req.session.adminId)) {
    const users = db.prepare('SELECT id, username, role FROM admins ORDER BY id ASC').all();
    return res.render('admin/users', { users, error: "You can't delete your own account while logged in as it.", success: null });
  }
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'admin'").get().c;
  const target = db.prepare('SELECT role FROM admins WHERE id = ?').get(req.params.id);
  if (target && target.role === 'admin' && adminCount <= 1) {
    const users = db.prepare('SELECT id, username, role FROM admins ORDER BY id ASC').all();
    return res.render('admin/users', { users, error: 'At least one Admin account must remain.', success: null });
  }
  db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  res.redirect('/admin/users');
});

/* ---------- SETTINGS (site info, logo, payment, password) ---------- */
router.get('/settings', requireLogin, requireAdminRole, (req, res) => {
  res.render('admin/settings', { settings: getSettings(), error: null, success: null });
});

// General site info: phone, whatsapp, email, address, hours
router.post('/settings/general', requireLogin, requireAdminRole, (req, res) => {
  const { site_phone, site_whatsapp, site_email, site_address, site_hours } = req.body;
  setSettings({ site_phone, site_whatsapp, site_email, site_address, site_hours });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Contact details updated. Changes are live on the website now.' });
});

// Social media links + trust badge stats
router.post('/settings/branding-extra', requireLogin, requireAdminRole, (req, res) => {
  const { social_facebook, social_instagram, social_linkedin, social_twitter, social_youtube,
    stat1_number, stat1_label, stat2_number, stat2_label, stat3_number, stat3_label, stat4_number, stat4_label } = req.body;
  setSettings({ social_facebook, social_instagram, social_linkedin, social_twitter, social_youtube,
    stat1_number, stat1_label, stat2_number, stat2_label, stat3_number, stat3_label, stat4_number, stat4_label });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Social links and stats updated.' });
});

// Footer CMS: footer logo (falls back to the main site logo if not set),
// footer description text, and the copyright line
router.post('/settings/footer', requireLogin, requireAdminRole, upload.single('footer_logo'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { footer_description, footer_copyright } = req.body;
  const data = { footer_description, footer_copyright };
  if (req.file) {
    removeUploadedFile(getSettings().footer_logo_url);
    data.footer_logo_url = '/uploads/' + req.file.filename;
  }
  setSettings(data);
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Footer updated. It is now live on the website.' });
});

router.post('/settings/footer/logo/remove', requireLogin, requireAdminRole, (req, res) => {
  removeUploadedFile(getSettings().footer_logo_url);
  setSettings({ footer_logo_url: '' });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Footer logo removed — the main site logo will be used instead.' });
});

// Site-wide SEO defaults: meta title/description, OG image, keywords, canonical, robots
router.post('/settings/seo', requireLogin, requireAdminRole, upload.single('default_og_image'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  const { default_meta_title, default_meta_description, default_keywords, default_canonical, default_robots } = req.body;
  const data = { default_meta_title, default_meta_description, default_keywords, default_canonical, default_robots };
  if (req.file) {
    removeUploadedFile(getSettings().default_og_image);
    data.default_og_image = '/uploads/' + req.file.filename;
  }
  setSettings(data);
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'SEO defaults updated.' });
});

router.post('/settings/seo/og-image/remove', requireLogin, requireAdminRole, (req, res) => {
  removeUploadedFile(getSettings().default_og_image);
  setSettings({ default_og_image: '' });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'OG image removed.' });
});

// Logo upload
router.post('/settings/logo', requireLogin, requireAdminRole, upload.single('logo'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  if (!req.file) {
    return res.render('admin/settings', { settings: getSettings(), error: 'Please choose an image file to upload.', success: null });
  }
  const current = getSettings();
  removeUploadedFile(current.site_logo_url);
  setSettings({ site_logo_url: '/uploads/' + req.file.filename });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Logo updated. It is now live on the website.' });
});

router.post('/settings/logo/remove', requireLogin, requireAdminRole, (req, res) => {
  const current = getSettings();
  removeUploadedFile(current.site_logo_url);
  setSettings({ site_logo_url: '' });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Logo removed. The text logo will be shown instead.' });
});

// Payment details: UPI, bank details, QR code image
router.post('/settings/payment', requireLogin, requireAdminRole, (req, res) => {
  const { payment_upi, payment_bank_name, payment_account_name, payment_account_number, payment_ifsc, payment_note } = req.body;
  setSettings({ payment_upi, payment_bank_name, payment_account_name, payment_account_number, payment_ifsc, payment_note });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Payment details updated. Changes are live on the website now.' });
});

router.post('/settings/payment/qr', requireLogin, requireAdminRole, upload.single('qr'), verifyCsrfToken, verifyImageContent, processImages, (req, res) => {
  if (!req.file) {
    return res.render('admin/settings', { settings: getSettings(), error: 'Please choose a QR code image to upload.', success: null });
  }
  const current = getSettings();
  removeUploadedFile(current.payment_qr_url);
  setSettings({ payment_qr_url: '/uploads/' + req.file.filename });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Payment QR code updated.' });
});

router.post('/settings/payment/qr/remove', requireLogin, requireAdminRole, (req, res) => {
  const current = getSettings();
  removeUploadedFile(current.payment_qr_url);
  setSettings({ payment_qr_url: '' });
  res.render('admin/settings', { settings: getSettings(), error: null, success: 'Payment QR code removed.' });
});

router.post('/settings/password', requireLogin, (req, res) => {
  const { current_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const view = req.session.role === 'admin' ? 'admin/settings' : 'admin/account';
  const viewData = req.session.role === 'admin' ? { settings: getSettings() } : { admin };
  if (!bcrypt.compareSync(current_password || '', admin.password_hash)) {
    return res.render(view, { ...viewData, error: 'Current password is incorrect', success: null });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.render(view, { ...viewData, error: null, success: 'Password updated successfully' });
});

// A minimal "My Account" page for Editors (who can't access full Settings) to
// change their own password
router.get('/account', requireLogin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  res.render('admin/account', { admin, error: null, success: null });
});

/* ---------- GENERIC BULK ACTIONS, DUPLICATE & DRAG-DROP REORDER ---------- */
module.exports = router;
