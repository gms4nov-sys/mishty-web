function requireLogin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/admin/login');
}

// Restricts a route to full Admins only — Editors get a friendly "not
// allowed" page instead of a raw 403, and are redirected back to the
// dashboard rather than left on a dead end.
function requireAdminRole(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).send(`
    <div style="font-family:sans-serif; max-width:520px; margin:60px auto; text-align:center;">
      <h2 style="color:#C43E1C;">Editors don't have access to this section</h2>
      <p>This area (Settings / Admin Users) is limited to full Admin accounts. Ask an Admin if you need something changed here.</p>
      <a href="/admin" style="color:#1a56db;">&larr; Back to dashboard</a>
    </div>
  `);
}

module.exports = { requireLogin, requireAdminRole };
