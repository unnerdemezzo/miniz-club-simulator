// Controllo accessi lato gioco, come in Slot Car (js/access.js + js/access-bootstrap.js).
// Il vero blocco lo fa il server (middleware.js): qui il gioco parte solo dopo la verifica,
// passa in modalità demo se la sessione è una demo, e si ferma se il codice viene revocato.
const POLICY_KEY = 'miniz.accessPolicy';
const CACHE_PREFIX = 'miniz-club-sim-v';
const CHECK_EVERY_MS = 60000;
const localHost = (host) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);

async function fetchAccessState() {
  let response;
  try {
    response = await fetch('/api/access', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    const error = new Error('network');
    error.accessFailure = 'network';
    throw error;
  }
  if (!response.ok) {
    const error = new Error('http');
    error.status = response.status;
    error.accessFailure = 'http';
    throw error;
  }
  const state = await response.json().catch(() => null);
  if (!state || typeof state.enabled !== 'boolean' || typeof state.authenticated !== 'boolean') {
    const error = new Error('schema');
    error.accessFailure = 'schema';
    throw error;
  }
  return state;
}

export async function clearGameAccessCache() {
  if (!globalThis.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
}

function storedPolicy() {
  try {
    return localStorage.getItem(POLICY_KEY);
  } catch {
    return null;
  }
}

function rememberPolicy(enabled) {
  try {
    localStorage.setItem(POLICY_KEY, enabled ? 'protected' : 'public');
  } catch {}
}

// Schermata che copre il gioco quando non si riesce a verificare l'accesso
function createOverlay(onRetry) {
  const overlay = document.createElement('section');
  overlay.id = 'access-gate';
  overlay.setAttribute('role', 'alert');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '10000', display: 'none', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '28px',
    background: 'rgba(9,13,22,.97)', color: '#f8fafc', textAlign: 'center',
    font: "16px 'Titillium Web', system-ui, sans-serif"
  });
  const title = document.createElement('strong');
  const text = document.createElement('p');
  const retry = document.createElement('button');
  title.textContent = 'MINI-Z CLUB SIMULATOR';
  title.style.fontSize = '26px';
  retry.type = 'button';
  retry.textContent = 'Riprova';
  Object.assign(retry.style, {
    padding: '12px 24px', border: '0', borderRadius: '8px', background: '#e11d48',
    color: '#fff', font: "700 16px 'Titillium Web', system-ui", cursor: 'pointer'
  });
  retry.addEventListener('click', onRetry);
  overlay.append(title, text, retry);
  document.body.append(overlay);
  return {
    show(message) {
      text.textContent = message;
      overlay.style.display = 'flex';
    },
    hide() {
      overlay.style.display = 'none';
    }
  };
}

// Avvia il gioco solo con il permesso del server. startGame({ demo }) viene chiamato una volta.
export function startWithAccess(startGame) {
  let started = false;
  let startedDemo = false;
  let checking = null;
  const overlay = createOverlay(() => void check());

  const begin = (demo) => {
    overlay.hide();
    if (started) return;
    started = true;
    startedDemo = demo;
    document.documentElement.dataset.demo = String(demo);
    startGame({ demo });
  };

  const goToAccess = async () => {
    try {
      await clearGameAccessCache();
    } catch {}
    location.replace('/access');
  };

  async function check() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const state = await fetchAccessState();
        rememberPolicy(state.enabled);
        if (state.enabled && !state.authenticated) {
          overlay.show('Accesso richiesto. Apertura della pagina di attivazione…');
          await goToAccess();
          return;
        }
        const demo = state.enabled && state.demo === true;
        // Codice inserito in un'altra scheda o demo finita: si ricarica con i nuovi limiti
        if (started && demo !== startedDemo) {
          location.reload();
          return;
        }
        begin(demo);
      } catch (error) {
        // In sviluppo locale (vite) l'API non esiste: si gioca senza controllo
        const devServer = error.status === 404 && localHost(location.hostname);
        const offlinePublic = error.accessFailure === 'network' && storedPolicy() === 'public';
        if (devServer || offlinePublic) {
          begin(false);
          return;
        }
        if (started && error.accessFailure === 'network' && storedPolicy() !== 'public') {
          // Gioco già aperto con accesso verificato: senza rete si ricontrolla al prossimo giro
          return;
        }
        overlay.show('Non riusciamo a verificare l’accesso. Controlla la connessione e riprova.');
      } finally {
        checking = null;
      }
    })();
    return checking;
  }

  const visible = () => {
    if (!document.hidden) void check();
  };
  setInterval(visible, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', visible);
  void check();
}
