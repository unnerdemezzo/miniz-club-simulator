// Server-only access control. Never import this module into the game bundle.
export const COOKIE = '__Host-miniz_access';
// The owner's admin session has its own cookie: signing in or out as owner
// never replaces the player access already active in the same browser.
export const ADMIN_COOKIE = '__Host-miniz_admin';
const YEAR = 365 * 24 * 60 * 60;
const ADMIN_AGE = 8 * 60 * 60;
// A demo session opens only the demo (one track, one car, short race): the game
// itself enforces the limits. It ends after 30 days or when a code is redeemed.
const DEMO_AGE = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

export class AccessError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function namespace(env) {
  // A preview must never consume or revoke a production gift.
  return `miniz:{access-${env.VERCEL_ENV === 'production' ? 'production' : 'preview'}}:`;
}
export function accessEnabled(env) { return env.MINIZ_ACCESS_ENABLED === '1' || env.MINIZ_ACCESS_ENABLED === 'true'; }
export function configuration(env) {
  const url = env.STORAGE_REST_API_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.STORAGE_REST_API_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !/^https:\/\/[^/]+\/?$/.test(url) || (env.MINIZ_ADMIN_PASSWORD || '').length < 20) {
    throw new AccessError(503, 'Accesso in configurazione. Riprova più tardi.');
  }
  return { url: url.replace(/\/$/, ''), token };
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function equalSecret(a, b) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
export function cookieToken(request, name = COOKIE) {
  const entries = (request.headers.get('cookie') || '').split(';').map(v => v.trim());
  const values = entries.filter(v => v.startsWith(name + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function cookie(token, age = YEAR, name = COOKIE) {
  return `${name}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
}
export function json(value, status = 200, setCookie) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (setCookie) headers['Set-Cookie'] = setCookie;
  return new Response(JSON.stringify(value), { status, headers });
}
export function redisClient(env, fetcher = fetch) {
  const { url, token } = configuration(env);
  return async function command(...args) {
    let response;
    try {
      response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('storage');
      const body = await response.json();
      if (body.error || !Object.hasOwn(body, 'result')) throw new Error('storage');
      return body.result;
    } catch {
      // Credentials, codes, emails and upstream response bodies must not enter logs.
      throw new AccessError(503, 'Verifica accesso non disponibile. Riprova tra poco.');
    }
  };
}

// EVAL runs on the primary. Binding the browser, consuming the gift and creating
// its session are one atomic operation, including idempotent same-browser retry.
export const REDEEM_GIFT = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 'invalid' end
local gift = cjson.decode(raw)
if gift.kind ~= 'gift' or gift.status == 'revoked' then return 'invalid' end
if gift.browserHash and gift.browserHash ~= ARGV[2] then return 'used' end
gift.browserHash = ARGV[2]
gift.status = 'active'
if not gift.activatedAt then gift.activatedAt = ARGV[3] end
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(gift))
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[5])
return 'ok'
`;
export const CREATE_GRANT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return 1
`;
export const REVOKE_GRANT = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local grant = cjson.decode(raw)
grant.status = 'revoked'
grant.revokedAt = ARGV[2]
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(grant))
return 1
`;
export const READ_SESSION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local session = cjson.decode(raw)
if session.kind == 'admin' then
  if session.authVersion == ARGV[1] then return raw else return nil end
end
if session.kind == 'demo' then return raw end
local record = redis.call('HGET', KEYS[2], session.grantId)
if not record then return nil end
local grant = cjson.decode(record)
if grant.status ~= 'active' then return nil end
if grant.kind == 'gift' and grant.browserHash ~= ARGV[2] then return nil end
return raw
`;
const RATE_LIMIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
`;
const LIST_GRANTS = `
local ids = redis.call('ZREVRANGE', KEYS[2], ARGV[1], ARGV[2])
local result = {}
for _, id in ipairs(ids) do
  local raw = redis.call('HGET', KEYS[1], id)
  if raw then table.insert(result, raw) end
end
return result
`;
async function readSession(token, env, command) {
  if (!token) return null;
  const prefix = namespace(env);
  const hash = await digest(token);
  const raw = await command('EVAL', READ_SESSION, 2, prefix + 'session:' + hash, prefix + 'grants', await digest('admin:' + env.MINIZ_ADMIN_PASSWORD), hash);
  return raw ? JSON.parse(raw) : null;
}
export async function sessionFor(request, env, command) {
  // An active owner session wins; otherwise the browser's own player access.
  const admin = await readSession(cookieToken(request, ADMIN_COOKIE), env, command);
  if (admin?.kind === 'admin') return admin;
  return readSession(cookieToken(request), env, command);
}
function inputString(value, max = 200) {
  if (typeof value !== 'string' || value.length > max) throw new AccessError(400, 'Dati non validi.');
  return value.trim();
}
function assertSameOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AccessError(403, 'Richiesta non autorizzata.');
  }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new AccessError(415, 'Formato non valido.');
}
function publicGrant(grant) {
  const { id, kind, label, status, createdAt, activatedAt, revokedAt } = grant;
  return { id, kind, label, status, createdAt, activatedAt, revokedAt };
}
export async function handleAccess(request, env = process.env, dependencies = {}) {
  try {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Metodo non consentito.' }, 405);
    const enabled = accessEnabled(env);
    try { configuration(env); }
    catch (error) {
      if (request.method === 'GET' && !enabled) return json({ enabled: false, configured: false, authenticated: false, admin: false });
      throw error;
    }
    const command = dependencies.command || redisClient(env, dependencies.fetcher);
    const prefix = namespace(env), grants = prefix + 'grants', order = prefix + 'order';
    if (request.method === 'GET') {
      const session = await sessionFor(request, env, command);
      return json({ enabled, configured: true, authenticated: !!session, admin: session?.kind === 'admin', demo: session?.kind === 'demo' });
    }
    assertSameOrigin(request);
    const raw = await request.text();
    if (raw.length > 4096) throw new AccessError(413, 'Richiesta troppo grande.');
    let body;
    try { body = JSON.parse(raw); } catch { throw new AccessError(400, 'Dati non validi.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError(400, 'Dati non validi.');
    const action = body.action;
    if (!['prepare', 'gift', 'demo', 'admin-login', 'logout', 'list', 'create', 'revoke'].includes(action)) throw new AccessError(400, 'Operazione non valida.');
    // Exiting an existing session remains possible even after failed activation
    // attempts have filled their bucket. Origin validation still happens first.
    if (action === 'logout') {
      // Ends only the owner session; the player access in this browser stays.
      const token = cookieToken(request, ADMIN_COOKIE);
      if (token) await command('DEL', prefix + 'session:' + await digest(token));
      return json({ ok: true }, 200, cookie('', 0, ADMIN_COOKIE));
    }
    const administrative = ['list', 'create', 'revoke'].includes(action);
    if (administrative && (await sessionFor(request, env, command))?.kind !== 'admin') throw new AccessError(403, 'Accesso riservato al proprietario.');
    // Vercel replaces this header at its boundary; never trust a user-supplied
    // forwarding/identity header as an authentication credential.
    const ip = request.headers.get('x-vercel-forwarded-for') || 'unknown';
    const bucket = administrative ? 'admin' : action === 'admin-login' ? 'login' : action === 'demo' ? 'demo' : 'activation';
    const attempts = await command('EVAL', RATE_LIMIT, 1, prefix + 'rate:' + bucket + ':' + await digest(ip), 600);
    if (attempts > (administrative ? 120 : 30)) throw new AccessError(429, 'Troppi tentativi. Riprova tra dieci minuti.');
    if (action === 'prepare') {
      return json({ ok: true }, 200, cookie(cookieToken(request) || randomToken()));
    }
    if (action === 'demo') {
      // A personal access already active in this browser is never downgraded.
      const current = await readSession(cookieToken(request), env, command);
      if (current && current.kind !== 'demo') return json({ ok: true, demo: false });
      const token = randomToken();
      await command('SET', prefix + 'session:' + await digest(token), JSON.stringify({ kind: 'demo' }), 'EX', DEMO_AGE);
      return json({ ok: true, demo: true }, 200, cookie(token, DEMO_AGE));
    }
    if (action === 'admin-login') {
      // Passwords are opaque: never trim or normalize a submitted secret.
      if (typeof body.password !== 'string' || body.password.length > 512) throw new AccessError(400, 'Dati non validi.');
      const password = body.password;
      if (!await equalSecret(password, env.MINIZ_ADMIN_PASSWORD)) throw new AccessError(403, 'Credenziali non valide.');
      const token = randomToken();
      await command('SET', prefix + 'session:' + await digest(token), JSON.stringify({ kind: 'admin', authVersion: await digest('admin:' + env.MINIZ_ADMIN_PASSWORD) }), 'EX', ADMIN_AGE);
      return json({ ok: true }, 200, cookie(token, ADMIN_AGE, ADMIN_COOKIE));
    }
    if (action === 'gift') {
      const code = inputString(body.code).toUpperCase();
      if (!/^MZ-[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(code)) throw new AccessError(403, 'Codice non valido.');
      const token = cookieToken(request);
      if (!token) throw new AccessError(409, 'Abilita i cookie e riprova l’attivazione.');
      const hash = await digest(token), id = 'gift:' + await digest(code);
      const result = await command('EVAL', REDEEM_GIFT, 2, grants, prefix + 'session:' + hash, id, hash, new Date().toISOString(), JSON.stringify({ kind: 'gift', grantId: id }), YEAR);
      if (result !== 'ok') throw new AccessError(403, result === 'used' ? 'Questo codice è già stato attivato su un altro browser.' : 'Codice non valido o revocato.');
      return json({ ok: true }, 200, cookie(token));
    }
    if (action === 'create') {
      const label = inputString(body.label, 80) || 'Accesso personale';
      const code = 'MZ-' + randomToken().slice(0, 32).toUpperCase().match(/.{8}/g).join('-');
      const id = 'gift:' + await digest(code);
      const grant = { id, kind: 'gift', label, status: 'new', createdAt: new Date().toISOString() };
      const created = await command('EVAL', CREATE_GRANT, 2, grants, order, id, JSON.stringify(grant), Date.now());
      if (created !== 1) throw new AccessError(503, 'Codice non creato. Riprova.');
      return json({ code, grant: publicGrant(grant) });
    }
    if (action === 'revoke') {
      const id = inputString(body.id, 80);
      if (!/^gift:[a-f0-9]{64}$/.test(id)) throw new AccessError(400, 'Accesso non valido.');
      const found = await command('EVAL', REVOKE_GRANT, 1, grants, id, new Date().toISOString());
      if (!found) throw new AccessError(404, 'Accesso non trovato.');
      return json({ ok: true });
    }
    const page = body.page ?? 0;
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new AccessError(400, 'Pagina non valida.');
    const rows = await command('EVAL', LIST_GRANTS, 2, grants, order, page * 50, page * 50 + 50);
    return json({ grants: rows.slice(0, 50).map(row => publicGrant(JSON.parse(row))), more: rows.length > 50 });
  } catch (error) {
    return json({ error: error instanceof AccessError ? error.message : 'Verifica accesso non disponibile. Riprova tra poco.' }, error instanceof AccessError ? error.status : 503);
  }
}

