const crypto = require('crypto');

// Simple session-based synchronizer-token CSRF protection.
// (The old `csurf` npm package is deprecated, so this is a small
// hand-rolled replacement rather than pulling in an unmaintained dep.)

// Ensures every request has a per-session CSRF token, and exposes it to
// views as `csrfToken` so forms can embed it in a hidden field.
function attachCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// Verifies the token on state-changing requests. Reads from the form body
// field `_csrf` (all admin forms include this as a hidden input).
//
// Multipart (file-upload) requests are skipped here because express's body
// parsers don't touch multipart bodies — only multer does, further down
// each upload route's middleware chain — so req.body isn't populated yet at
// this point for those requests. Upload routes call verifyCsrfToken a
// second time, after their upload.single(...) middleware, to check it then.
function verifyCsrfToken(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next();

  const sent = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;

  if (!expected || !sent || sent !== expected) {
    return res.status(403).send(`
      <div style="font-family:sans-serif; max-width:520px; margin:60px auto; text-align:center;">
        <h2 style="color:#C43E1C;">Session expired or invalid request</h2>
        <p>This form's security token has expired or is invalid. Please go back and try again.</p>
        <a href="/admin" style="color:#1a56db;">&larr; Back to admin panel</a>
      </div>
    `);
  }
  next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
