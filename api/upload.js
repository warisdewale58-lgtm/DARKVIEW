const crypto = require('crypto');
const { putFile, requireAdmin, handler, httpErr } = require('./_lib');

module.exports = handler(async ({ pw, data }) => {
  await requireAdmin(pw);
  if (typeof data !== 'string' || !data) throw httpErr(400, 'bad_input', 'No image received.');
  const buf = Buffer.from(data, 'base64');
  if (buf.length > 3 * 1024 * 1024) throw httpErr(413, 'too_big', 'Photo is too large.');
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw httpErr(400, 'bad_image', 'Only JPEG photos are accepted.');
  const id = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
  const path = 'images/' + id + '.jpg';
  try { await putFile(path, buf, 'Add product photo'); }
  catch (e) { if (e.code !== 'conflict') throw e; } // already exists: same content
  return { url: '/' + path };
});
