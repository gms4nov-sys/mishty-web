require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const methodOverride = require('method-override');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { init } = require('./db/init');
init();

const { publicFormLimiter } = require('./middleware/rate-limit');

const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  console.warn('\n⚠️  WARNING: SESSION_SECRET is not set in .env — using an insecure default.');
  console.warn('   Set SESSION_SECRET to a long random value before going live.\n');
}

// If the app runs behind a reverse proxy (nginx, cPanel, Render, etc.), this
// lets express-rate-limit and secure cookies see the real client IP/protocol
// instead of the proxy's.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers. CSP is left off by default because the admin panel and
// site use inline onclick/onsubmit handlers — turning CSP on without first
// moving those to external scripts would break the UI. Everything else
// (clickjacking protection, MIME sniffing protection, etc.) is still applied.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(morgan(isProd ? 'combined' : 'dev'));

// Restrict cross-origin API access to known origins in production. Leave
// CORS_ORIGIN unset in development to allow any origin.
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/admin/public', express.static(path.join(__dirname, 'public/admin')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'mishty-web-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    httpOnly: true,
    secure: isProd,       // only sent over HTTPS in production
    sameSite: 'lax'        // blocks the cookie being sent on cross-site form posts
  }
}));

// Pretty, SEO-friendly catalog URLs — served by the client-side pages, which read
// the URL path to know which category / service / package to show.
// e.g. /services/website-development/shopify-store/business
const siteDir = path.join(__dirname, '../site');
app.get('/services/:category/:tech/:pkg', (req, res) => res.sendFile(path.join(siteDir, 'enquiry.html')));
app.get('/services/:category/:tech', (req, res) => res.sendFile(path.join(siteDir, 'packages.html')));
app.get('/services/:category', (req, res) => res.sendFile(path.join(siteDir, 'catalog.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(siteDir, 'blog-detail.html')));
app.get('/thank-you', (req, res) => res.sendFile(path.join(siteDir, 'thank-you.html')));

// Serve the public marketing site (index.html, about.html, etc.)
app.use(express.static(siteDir));

// Spam/abuse protection on the two public form-submission endpoints.
app.use('/api/contact', publicFormLimiter);
app.use('/api/enquiry', publicFormLimiter);

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Friendly error handler for upload issues (wrong file type, file too large, etc.)
app.use((err, req, res, next) => {
  if (err) {
    console.error('Request error:', err.message);
    const backTo = req.originalUrl.includes('/admin/gallery') ? '/admin/gallery' : (req.originalUrl.includes('/admin/settings') ? '/admin/settings' : '/admin');
    return res.status(400).send(`
      <div style="font-family:sans-serif; max-width:520px; margin:60px auto; text-align:center;">
        <h2 style="color:#C43E1C;">Upload failed</h2>
        <p>${err.message || 'Something went wrong with your upload.'}</p>
        <p>Please make sure the image is under 5MB and is a JPG, PNG, GIF, or WEBP file.</p>
        <a href="${backTo}" style="color:#1a56db;">← Go back and try again</a>
      </div>
    `);
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Mishty Web server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});
