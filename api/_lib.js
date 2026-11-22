const crypto = require('crypto');

const SALT = 'dv-admin:';
const DEFAULT_HASH = '91f62e00965c2e0dcd5365c4ae6e0c533cbabbd1d7f75f00fe9ba638f011a860'; // default password, change it in Settings
const REPO = () => process.env.GITHUB_REPO || 'Waris33-3/DARKVIEW';
const BRANCH = () => process.env.GITHUB_BRANCH || 'main';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pwHash = (p) => sha256(SALT + String(p || ''));
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

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
  if (!r.ok) throw httpErr(502, 'github_read', 'Could not read data.json from GitHub (' + r.status + ').');
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
    throw httpErr(502, 'github_write', 'GitHub refused the save (' + r.status + '). Check the token has Contents read/write. ' + t.slice(0, 120));
  }
  return r.json();
}

// Checks the admin password against the hash stored in data.json.
async function requireAdmin(pw) {
  let hash = DEFAULT_HASH, current = null;
  try { current = await readData(); hash = (current.data.settings && current.data.settings.adminHash) || DEFAULT_HASH; }
  catch (e) { if (e.code === 'not_configured') throw e; }
  if (!pw || !same(pwHash(pw), hash)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    throw httpErr(401, 'bad_password', 'Wrong admin password. Unlock the admin area again.');
  }
  return { hash, current };
}

function handler(fn) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only', code: 'method' });
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const out = await fn(body);
      res.status(200).json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Server error', code: e.code || 'server' });
    }
  };
}

module.exports = { pwHash, same, gh, readData, putFile, requireAdmin, handler, httpErr, SALT };
