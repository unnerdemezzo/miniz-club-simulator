// Demo senza codice (stesso schema di js/demo-mode.js in Slot Car): si corre solo sul Circuito Club Veloce
// con la Ferrari 499P, gara a tempo di 3 minuti, senza salvare nulla. Il resto del gioco resta visibile
// ma bloccato. Il server apre la demo (/api/access, azione "demo"); i limiti li applica il gioco.
export const DEMO = Object.freeze({
  trackId: 'club_veloce',
  bodyId: 'ferrari_499p',
  mode: 'time',
  minutes: 3
});
const ACCESS_LINK = '/access';
const STORAGE_KEY = 'miniz_club_sim_state_v1';
export const DEMO_LOCKED_TEXT =
  'Nella demo si corre solo sul Circuito Club Veloce con la Ferrari 499P, gara a tempo di 3 minuti. Inserisci il codice di accesso per sbloccare tutto.';

// Nessun salvataggio: le scelte valgono finché la pagina resta aperta. Le scritture del gioco vanno
// in memoria e non toccano i dati già presenti nel browser (profili, assetti e record del giocatore).
export function protectDemoStorage(win = window) {
  const proto = win.Storage?.prototype;
  if (!proto || proto.minizDemoProtected) return;
  const { getItem, setItem, removeItem } = proto;
  const memory = new Map();
  const game = (store, key) => store === win.localStorage && String(key) === STORAGE_KEY;
  Object.defineProperty(proto, 'minizDemoProtected', { value: true });
  proto.getItem = function (key) {
    return game(this, key) ? (memory.get(STORAGE_KEY) ?? null) : getItem.call(this, key);
  };
  proto.setItem = function (key, value) {
    if (game(this, key)) memory.set(STORAGE_KEY, String(value));
    else setItem.call(this, key, value);
  };
  proto.removeItem = function (key) {
    if (game(this, key)) memory.delete(STORAGE_KEY);
    else removeItem.call(this, key);
  };
}

// Impostazioni forzate nello stato del gioco (anche se qualcuno sbloccasse a mano i comandi)
export function applyDemoState(state) {
  state.currentTrackId = DEMO.trackId;
  state.currentBodyId = DEMO.bodyId;
  state.reverseTrack = false;
  state.raceSettings = { ...(state.raceSettings || {}), mode: DEMO.mode, minutes: DEMO.minutes };
}

// Comandi bloccati: scelta auto/telaio/pista, senso invertito, prove libere e gara a giri, durata,
// Banco Box, piste del menu e backup della configurazione. Restano liberi avversari, telecronaca,
// radiocomando, replay, telecamere, schermo e audio.
const LOCKED = [
  '#setup-sel-body',
  '#setup-sel-chassis',
  '#setup-sel-track',
  '#setup-chk-reverse',
  '#setup-sel-laps',
  '#setup-sel-minutes',
  '.setup-mode-btn[data-race-mode="practice"]',
  '.setup-mode-btn[data-race-mode="laps"]',
  '#btn-open-workbench-quick',
  '.menu-tab-btn[data-tab="tab-workbench"]',
  '#tab-track .choice-card',
  '#tab-workbench',
  '#tab-system .highlight-card'
];

export function installDemoUi() {
  if (document.getElementById('demo-band')) return;
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: `
#demo-band{position:fixed;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:8px 10px 8px 14px;border-radius:999px;background:rgba(9,13,22,.92);border:1px solid #b3202a;color:#f8fafc;font:600 12px/1.3 'Titillium Web',system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)}
#demo-band b{color:#fff;background:#b3202a;border-radius:999px;padding:3px 9px;font-weight:900;letter-spacing:.08em}
#demo-toast{position:fixed;left:50%;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 56px);transform:translateX(-50%);z-index:9001;max-width:min(520px,calc(100vw - 24px));padding:12px 16px;border-radius:12px;background:#111827;border:1px solid #b3202a;color:#f8fafc;font:600 14px/1.4 'Titillium Web',system-ui,sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.5)}
#demo-band a{flex-shrink:0;color:#fff;background:#b3202a;border-radius:999px;padding:6px 12px;font-weight:800;text-decoration:none}
.demo-locked{opacity:.45!important;cursor:not-allowed!important;filter:grayscale(.7)}
.demo-locked *{cursor:not-allowed!important}
@media (max-width:720px){#demo-band span{display:none}}`
    })
  );
  const band = document.createElement('div');
  band.id = 'demo-band';
  band.setAttribute('role', 'note');
  band.innerHTML =
    `<b>DEMO</b><span>Circuito Club Veloce · Ferrari 499P · gara di 3 minuti · nessun salvataggio</span>` +
    `<a href="${ACCESS_LINK}">Inserisci il codice e sblocca tutto</a>`;
  document.body.append(band);
  const toast = document.createElement('div');
  toast.id = 'demo-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  document.body.append(toast);
  let toastTimer = null;
  const notice = (text) => {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 4500);
  };

  const refresh = () => {
    for (const el of document.querySelectorAll(LOCKED.join(','))) {
      if (el.classList.contains('demo-locked')) continue;
      el.classList.add('demo-locked');
      el.setAttribute('aria-disabled', 'true');
      el.title = 'Disponibile con il codice di accesso';
    }
  };
  refresh();
  // Le schede del menu vengono ridisegnate (piste, auto): i blocchi si rimettono ogni volta
  const observer = new MutationObserver(refresh);
  for (const id of ['main-menu-modal', 'race-setup-screen']) {
    const root = document.getElementById(id);
    if (root) observer.observe(root, { childList: true, subtree: true });
  }
  // Un comando bloccato si vede ma non risponde: spiega come sbloccarlo
  const block = (event) => {
    const target = event.target?.closest?.('.demo-locked');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') notice(DEMO_LOCKED_TEXT);
  };
  for (const type of ['click', 'mousedown', 'pointerdown', 'change', 'input', 'keydown']) {
    document.addEventListener(type, block, true);
  }
}
