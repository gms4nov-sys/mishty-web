const rateLimit = require('express-rate-limit');

// Login: max 10 attempts per 15 minutes per IP. Slows down password guessing
// without locking out a real admin who mistypes a few times.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
  handler: (req, res) => {
    res.status(429).render('admin/login', { error: 'Too many login attempts. Please wait a few minutes and try again.' });
  }
});

// Public form submissions (contact form, enquiry form): max 8 per 10 minutes
// per IP. Stops basic bot spam without affecting a genuine visitor.
const publicFormLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many submissions from this network. Please try again in a few minutes.' }
});

module.exports = { loginLimiter, publicFormLimiter };
