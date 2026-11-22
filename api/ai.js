const { requireAdmin, handler, httpErr } = require('./_lib');

module.exports = handler(async ({ pw, input }) => {
  await requireAdmin(pw);
  if (typeof input !== 'string' || !input.trim()) throw httpErr(400, 'bad_input', 'Nothing to send.');
  if (input.length > 60000) throw httpErr(413, 'too_long', 'That request is too long.');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw httpErr(500, 'not_configured', 'ANTHROPIC_API_KEY is not set on Vercel.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: input }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429) throw httpErr(429, 'rate_limited', 'The assistant is busy. Wait a minute and try again.');
    throw httpErr(502, 'ai_error', 'The AI service returned ' + r.status + '. ' + t.slice(0, 160));
  }
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text };
});
