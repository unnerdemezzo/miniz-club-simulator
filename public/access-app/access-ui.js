// Pagina di accesso e gestione codici, come in Slot Car (js/access-ui.js).
// Le copie del gioco salvate dal service worker si cancellano all'uscita del proprietario.
async function clearGameAccessCache() {
  if (!globalThis.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('miniz-club-sim-v')).map(key => caches.delete(key)));
}

const byId = id => document.getElementById(id);
const isAdmin = /^\/admin(?:\/|\.html)?$/.test(location.pathname);
const gameLink = new URL('/', location.href).href;
let page = 0, currentGiftId = null, adminSessionActive = false, checkingAdmin = false, adminViewVersion = 0;
byId('game-link').value = gameLink;
function message(text, error = false) { byId('message').textContent = text; byId('message').classList.toggle('error', error); }
async function api(action, values = {}) {
  const response = await fetch('/api/access', action ? {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...values }), cache: 'no-store', signal: AbortSignal.timeout(15000)
  } : { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Operazione non riuscita.');
    error.status = response.status;
    throw error;
  }
  return result;
}
async function busy(button, operation) {
  button.disabled = true; message('Operazione in corso…');
  try { await operation(); } catch (error) {
    if (isAdmin && error.status === 403) hidePrivateDashboard();
    message(error.message || 'Collegamento non disponibile. Riprova.', true);
  }
  finally { button.disabled = false; }
}
byId('player-form').addEventListener('submit', event => {
  event.preventDefault();
  void busy(event.submitter, async () => {
    await api('prepare');
    await api('gift', { code: byId('code').value });
    byId('code').value = '';
    message('Accesso autorizzato. Apertura del gioco…'); location.replace('/');
  });
});
// The demo opens one track and one car; the game itself applies the limits.
byId('demo-button').addEventListener('click', event => {
  void busy(event.currentTarget, async () => {
    const result = await api('demo');
    message(result.demo === false ? 'Questo browser ha già un accesso completo. Apertura del gioco…' : 'Apertura della demo…');
    location.replace('/');
  });
});
byId('admin-form').addEventListener('submit', event => {
  event.preventDefault();
  void busy(event.submitter, async () => {
    await api('admin-login', { password: byId('password').value });
    adminSessionActive = true;
    adminViewVersion++;
    updateNavigation(true); byId('password').value = '';
    byId('admin-login').hidden = true; byId('dashboard').hidden = false;
    await loadGrants(); message('');
  });
});
const statusText = { new: 'Da attivare', active: 'Attivo', revoked: 'Revocato' };
const date = value => value ? new Date(value).toLocaleDateString('it-IT') : '';
async function loadGrants() {
  const view = adminViewVersion;
  const result = await api('list', { page });
  if (!adminSessionActive || view !== adminViewVersion) return;
  byId('grants').replaceChildren();
  for (const grant of result.grants) {
    const row = document.createElement('li'), details = document.createElement('div');
    const name = document.createElement('strong'), info = document.createElement('small');
    name.textContent = grant.label || 'Accesso personale';
    info.textContent = 'Un browser · ' + (statusText[grant.status] || grant.status) + ' · ' + date(grant.createdAt);
    if (grant.activatedAt) info.textContent += ' · Attivato il ' + date(grant.activatedAt);
    details.append(name, info); row.append(details);
    if (grant.status !== 'revoked') {
      const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'danger'; revoke.textContent = 'Revoca';
      revoke.addEventListener('click', () => {
        if (!confirm('Revocare l’accesso a “' + name.textContent + '”? Per riabilitarlo occorrerà un nuovo codice.')) return;
        void busy(revoke, async () => {
          await api('revoke', { id: grant.id });
          if (currentGiftId === grant.id) {
            currentGiftId = null; byId('copy-fallback').hidden = true;
            byId('copy-text').value = ''; byId('gift-code').textContent = ''; byId('new-gift').hidden = true;
          }
          await loadGrants(); message('Accesso revocato.');
        });
      });
      row.append(revoke);
    }
    byId('grants').append(row);
  }
  if (!result.grants.length) { const row = document.createElement('li'); row.textContent = 'Nessun accesso in questa pagina.'; byId('grants').append(row); }
  byId('previous').disabled = page === 0; byId('next').disabled = !result.more; byId('page-label').textContent = 'Pagina ' + (page + 1);
}
byId('gift-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!byId('new-gift').hidden && !confirm('Hai copiato il codice precedente? Generandone un altro, il precedente non sarà più visibile.')) return;
  void busy(event.submitter, async () => {
    const view = adminViewVersion;
    const result = await api('create', { label: byId('label').value });
    if (!adminSessionActive || view !== adminViewVersion) return;
    byId('copy-fallback').hidden = true; byId('copy-text').value = '';
    currentGiftId = result.grant.id; byId('gift-code').textContent = result.code;
    byId('new-gift').hidden = false; byId('label').value = ''; page = 0;
    message('Codice creato. Copialo prima di chiudere la pagina.'); await loadGrants();
  });
});
async function copyText(text, success) {
  try { await navigator.clipboard.writeText(text); byId('copy-fallback').hidden = true; message(success); }
  catch {
    const field = byId('copy-text'); field.value = text; byId('copy-fallback').hidden = false;
    field.focus(); field.select(); message('Copia il testo selezionato qui sotto.');
  }
}
byId('copy-code').addEventListener('click', () => { const code = byId('gift-code').textContent; if (code) void copyText(code, 'Codice copiato.'); });
byId('copy-link').addEventListener('click', () => { void copyText(gameLink, 'Link del gioco copiato.'); });
byId('copy-invite').addEventListener('click', () => {
  const code = byId('gift-code').textContent; if (!code) return;
  void copyText('Ti invito a MINI-Z CLUB SIMULATOR!\n\nApri: ' + gameLink + '\nInserisci il codice personale:\n' + code +
    '\n\nIl codice abilita un solo browser: attivalo sul dispositivo in cui vuoi giocare.', 'Invito copiato con link e codice.');
});
byId('refresh').addEventListener('click', () => { void busy(byId('refresh'), async () => { await loadGrants(); message('Elenco aggiornato.'); }); });
byId('previous').addEventListener('click', () => { page = Math.max(0, page - 1); loadGrants().catch(error => message(error.message, true)); });
byId('next').addEventListener('click', () => { page++; loadGrants().catch(error => message(error.message, true)); });
byId('logout').addEventListener('click', () => {
  void busy(byId('logout'), async () => {
    hidePrivateDashboard();
    await api('logout');
    try { await clearGameAccessCache(); } catch {}
    location.replace('/admin');
  });
});
function hidePrivateDashboard() {
  adminViewVersion++;
  adminSessionActive = false; currentGiftId = null;
  byId('password').value = ''; byId('gift-code').textContent = '';
  byId('copy-text').value = ''; byId('copy-fallback').hidden = true;
  byId('new-gift').hidden = true; byId('grants').replaceChildren();
  byId('dashboard').hidden = true; byId('admin-login').hidden = !isAdmin;
  updateNavigation();
}
async function verifyAdminView() {
  if (!isAdmin || !adminSessionActive || checkingAdmin || document.hidden) return;
  checkingAdmin = true;
  const view = adminViewVersion;
  try {
    const state = await api();
    if (view !== adminViewVersion) return;
    if (!state.admin) { hidePrivateDashboard(); message('La sessione del proprietario è terminata. Accedi di nuovo.'); }
  } catch {
    if (view !== adminViewVersion) return;
    hidePrivateDashboard(); message('Non riusciamo a verificare la sessione. Accedi di nuovo quando sei online.', true);
  } finally { checkingAdmin = false; }
}
window.addEventListener('pageshow', () => { void verifyAdminView(); });
window.addEventListener('focus', () => { void verifyAdminView(); });
document.addEventListener('visibilitychange', () => { void verifyAdminView(); });
if (isAdmin) window.setInterval(() => { void verifyAdminView(); }, 60000);
function updateNavigation(adminSession = false) {
  const link = byId('access-switch');
  link.href = adminSession ? '/' : isAdmin ? '/access' : '/admin';
  link.textContent = adminSession ? 'Torna al gioco' : isAdmin ? 'Accesso con codice' : 'Accesso proprietario';
}
async function start() {
  updateNavigation();
  byId('intro').textContent = isAdmin ? 'Genera, distribuisci e gestisci gli accessi personali.' : 'La pista del club ti aspetta.';
  byId(isAdmin ? 'admin-login' : 'player').hidden = false;
  const state = await api();
  if (!state.configured) {
    for (const button of document.querySelectorAll('form button, #demo-button')) button.disabled = true;
    message('La distribuzione con codici deve ancora essere configurata dal proprietario.');
    byId('public-game').hidden = state.enabled !== false;
    return;
  }
  byId('gate-mode').hidden = state.enabled;
  if (isAdmin && state.admin) {
    adminSessionActive = true;
    adminViewVersion++;
    updateNavigation(true); byId('admin-login').hidden = true; byId('dashboard').hidden = false; await loadGrants();
  } else if (!isAdmin && state.demo) {
    byId('demo-active').hidden = false; byId('demo-button').textContent = 'Torna alla demo';
  } else if (!isAdmin && (state.authenticated || !state.enabled)) location.replace('/');
}
start().catch(error => message(error.message || 'Collegamento non disponibile. Riprova.', true));

