const { pwHash, readData, putFile, requireAdmin, handler, httpErr } = require('./_lib');

module.exports = handler(async ({ pw, pwNext, data }) => {
  const { hash, current } = await requireAdmin(pw);
  if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.products) || !Array.isArray(data.categories))
    throw httpErr(400, 'bad_data', 'The store data looks wrong, nothing was saved.');
  // The password hash can only change when the old password was proven AND a new one is supplied.
  if (pwNext) {
    if (String(pwNext).length < 8) throw httpErr(400, 'weak_password', 'New password must be at least 8 characters.');
    data.settings.adminHash = pwHash(pwNext);
  } else {
    data.settings.adminHash = hash;
  }
  const buf = Buffer.from(JSON.stringify(data, null, 1), 'utf8');
  if (buf.length > 3 * 1024 * 1024) throw httpErr(413, 'too_big', 'Store data is too large.');
  const cur = current || (await readData());
  await putFile('data.json', buf, 'Update store from admin dashboard', cur.sha);
  return { ok: true };
});
