// ESM server adapter matches the middleware and the project module format.
export default async function accessApi(req, res) {
  const { handleAccess, json } = await import('../server/access.mjs');
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers || {})) {
      if (value != null) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const url = new URL(req.url || '/api/access', 'https://' + (req.headers?.host || 'localhost'));
    const method = req.method || 'GET';
    let body;
    if (!['GET', 'HEAD'].includes(method)) {
      if (req.body != null) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      else {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 4096) { const response = json({ error: 'Richiesta troppo grande.' }, 413); return send(response, res); }
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (Buffer.byteLength(body) > 4096) return send(json({ error: 'Richiesta troppo grande.' }, 413), res);
    }
    return send(await handleAccess(new Request(url, { method, headers, ...(body == null ? {} : { body }) })), res);
  } catch {
    return send(json({ error: 'Verifica accesso non disponibile. Riprova tra poco.' }, 503), res);
  }
};
async function send(response, res) {
  for (const [name, value] of response.headers) res.setHeader(name, value);
  res.statusCode = response.status;
  res.end(await response.text());
}

