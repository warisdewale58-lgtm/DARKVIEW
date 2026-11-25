const crypto = require('crypto');

const REPO = () => process.env.GITHUB_REPO || 'warisdewale58-lgtm/DARKVIEW';
const BRANCH = () => process.env.GITHUB_BRANCH || 'main';

/* ---- password hashing: scrypt with a per-password random salt ---- */
/* Stored format: scrypt$<hex salt 16 bytes>$<hex hash 64 bytes>.
   Legacy SHA-256 hashes (sha256$..., or bare 64-hex) are still accepted at
   verification time but are upgraded to scrypt the next time the password is
   changed in Settings, so existing sites don't lock their owners out. */
const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, SCRYPT_LEN = 64;

const scryptHash = (pw, salt) => crypto.scryptSync(String(pw || ''), salt, SCRYPT_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024 });

function makeHash(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + scryptHash(pw, salt).toString('hex');
}

function verifyPw(pw, stored) {
  const s = String(stored || '');
  try {
    if (s.startsWith('scrypt$')) {
      const parts = s.split('$');
      if (parts.length !== 3) return false;
      const salt = Buffer.from(parts[1], 'hex');
      const want = Buffer.from(parts[2], 'hex');
      const got = scryptHash(pw, salt);
      return want.length === got.length && crypto.timingSafeEqual(want, got);
    }
    // Legacy: bare 64-hex SHA-256 or sha256$<hex> with fixed salt.
    const hex = s.startsWith('sha256$') ? s.slice(7) : s;
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
    const legacy = crypto.createHash('sha256').update('dv-admin:' + String(pw || '')).digest('hex');
    const a = Buffer.from(hex, 'hex'), b = Buffer.from(legacy, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    // Avoid timing leaks: always perform a scrypt even on malformed hashes.
    scryptHash(pw, Buffer.alloc(16));
    return false;
  }
}

/* ---- per-IP rate limiting for all admin API routes ---- */
/* A small in-memory record keyed by hashed IP. Vercel serverless instances are
   ephemeral and per-region, so this is a strong deterrent rather than a global
   guarantee; for a hard global limit, put the site behind Cloudflare/Vercel WAF
   or Redis. Failed guesses cost ~50ms of scrypt plus a growing backoff. */
const RL_WINDOW_MS = 15 * 60 * 1000;
const RL_MAX = 8;          // failed attempts per 15 minutes per IP
const RLBan = 30 * 60 * 1000; // 30-minute ban after the limit is hit
const rl = new Map();       // key -> { fails, first, until }

function clientKey(req) {
  const xf = String(req.headers['x-forwarded-for'] || '');
  const ip = (xf.split(',')[0] || '').trim() || req.headers['x-real-ip'] || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

function rlCheck(req) {
  const key = clientKey(req);
  const now = Date.now();
  let r = rl.get(key);
  if (!r) { r = { fails: 0, first: now, until: 0 }; rl.set(key, r); }
  if (r.until > now) {
    const e = httpErr(429, 'rate_limited', 'Too many attempts. Try again in ' + Math.ceil((r.until - now) / 1000) + ' seconds.');
    e.retryAfter = Math.ceil((r.until - now) / 1000);
    throw e;
  }
  if (now - r.first > RL_WINDOW_MS) { r.fails = 0; r.first = now; }
  // Opportunistic cleanup so the map doesn't grow without bound.
  if (rl.size > 5000) for (const [k, v] of rl) if (now - v.first > RL_WINDOW_MS && v.until <= now) rl.delete(k);
  return { key, record: r, now };
}

function rlFail(state) {
  const r = state.record;
  r.fails++;
  if (r.fails >= RL_MAX) { r.until = state.now + RLBan; r.fails = 0; }
  // Progressive delay: 100ms -> 800ms per consecutive failure.
  const delay = Math.min(800, 100 * r.fails);
  return new Promise(res => setTimeout(res, delay));
}

function rlSuccess(state) { rl.delete(state.key); }

function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw httpErr(500, 'not_configured', 'GITHUB_TOKEN is not set on Vercel.');
  return fetch('https://api.github.com/repos/' + REPO() + '/contents/' + path + (opts.method === 'PUT' ? '' : '?ref=' + BRANCH()), {
    ...opts,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'user-agent': 'dark-view-store',
      'content-type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

function httpErr(status, code, error) {
  const e = new Error(error); e.status = status; e.code = code; return e;
}

// Reads data.json from GitHub (the source of truth). Returns {data, sha}.
async function readData() {
  const r = await gh('data.json');
  if (r.status === 404) throw httpErr(502, 'github_read', 'GitHub cannot find ' + REPO() + ' on branch ' + BRANCH() + '. Set GITHUB_REPO to the owner/repo of this site and GITHUB_TOKEN with Contents read/write.');
  if (!r.ok) throw httpErr(502, 'github_read', 'Could not read data.json from ' + REPO() + ' (' + r.status + '). Check GITHUB_TOKEN has Contents read/write.');
  const j = await r.json();
  const data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  return { data, sha: j.sha };
}

async function putFile(path, contentBuf, message, sha) {
  const body = { message, content: contentBuf.toString('base64'), branch: BRANCH() };
  if (sha) body.sha = sha;
  const r = await gh(path, { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 409 || r.status === 422) throw httpErr(409, 'conflict', 'The site changed while you were editing. Reload the page and try again.');
    throw httpErr(502, 'github_write', 'GitHub refused the save to ' + REPO() + ' (' + r.status + '). Check the token has Contents read/write. ' + t.slice(0, 120));
  }
  return r.json();
}

// Checks the admin password against the hash stored on GitHub (server-side truth).
// `req` is passed so every route shares the same per-IP rate limit.
async function requireAdmin(pw, req) {
  const state = rlCheck(req);
  let hash = null, current = null;
  try { current = await readData(); hash = (current.data.settings && current.data.settings.adminHash) || null; }
  catch (e) {
    if (e.code === 'not_configured') throw e;
    // If GitHub can't be read, fail closed rather than accepting a guess.
    throw httpErr(502, 'github_read', 'Could not verify the admin password. Try again shortly.');
  }
  if (!pw || !verifyPw(pw, hash)) {
    await rlFail(state);
    throw httpErr(401, 'bad_password', 'Wrong admin password. Unlock the admin area again.');
  }
  rlSuccess(state);
  return { hash, current };
}

function handler(fn) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only', code: 'method' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const out = await fn(body, req, res);
      res.status(200).json(out);
    } catch (e) {
      if (e.retryAfter) res.setHeader('retry-after', String(e.retryAfter));
      res.status(e.status || 500).json({ error: e.message || 'Server error', code: e.code || 'server' });
    }
  };
}

module.exports = { makeHash, verifyPw, gh, readData, putFile, requireAdmin, handler, httpErr };
