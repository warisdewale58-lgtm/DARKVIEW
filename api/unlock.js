const { requireAdmin, handler } = require('./_lib');

// Verifies the admin password server-side and returns ok. Uses the same
// per-IP rate limit and the authoritative hash from GitHub, so the browser
// never needs the hash and offline guessing is impossible.
module.exports = handler(async (body, req) => {
  await requireAdmin(body.pw, req);
  return { ok: true };
});
