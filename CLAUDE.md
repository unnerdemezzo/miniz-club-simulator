# Mini-Z Club Simulator

Simulatore 3D (Three.js + Vite) di auto RC Kyosho Mini-Z in un club indoor. L'obiettivo è un simulatore realistico, non un arcade.

## Deploy e versione (regola obbligatoria)

- `main` viene pubblicato in automatico su Vercel (https://miniz-club-simulator.vercel.app). Le modifiche passano da una PR, non da push diretti su `main`.
- **Ogni modifica che va su Vercel deve aumentare la versione in `package.json`** (`npm version patch|minor --no-git-tag-version`, che aggiorna anche `package-lock.json`).
  - Schema scelto dall'utente: si aumenta sempre il terzo numero fino a 9 (1.6.0 → 1.6.1 → … → 1.6.9), poi sale il secondo e il terzo riparte da 0 (1.6.9 → 1.7.0). Quindi `npm version patch`, tranne quando il terzo numero è 9: lì `npm version minor`.
- La versione è l'unica fonte di verità: `vite.config.js` la inietta come `__APP_VERSION__`, `src/version.js` la esporta e l'app la mostra nella schermata iniziale e nella barra in alto. Il service worker viene registrato come `/sw.js?v=<versione>`, quindi una nuova versione invalida anche la cache dell'app installata. Non scrivere numeri di versione a mano altrove.

## Comandi

- `npm run dev` (sviluppo), `npm run build` (build di produzione in `dist/`, la stessa che usa Vercel).

## Flusso del gioco

L'app si apre sulla schermata **Impostazioni gara** (`#race-setup-screen`, `showRaceSetup()` in `src/main.js`): l'auto non è in pista finché non si preme INIZIA. Poi semaforo (`beginRace()`), gara (`racePhase === 'racing'`) e risultati (`finishRace()`). Il pulsante "Installa App" (sempre facoltativo) compare nella schermata iniziale e nella barra in alto quando l'installazione è possibile (prompt `beforeinstallprompt`, tenuto da parte già in `index.html`, oppure iPhone/iPad con le istruzioni "Condividi → Aggiungi alla schermata Home") e sparisce quando l'app è installata; stesso schema di `js/pwa.js` in unnerdemezzo/Slot-Car. Icone PNG 192/512/maskable e apple-touch-icon in `public/`.

## Auto in pista

- Carrozzerie Hypercar (`public/models/*.glb`, crediti in `public/models/CREDITS.md`): i materiali PBR restano quelli dei modelli originali, `src/car/hypercar-body.js` li clona soltanto (niente tinte, desaturazione o metallo/rugosità forzati), sia per il giocatore sia per gli avversari, che usano altre Hypercar del catalogo. Nodi richiesti: `Body` e `WHEEL_LF/RF/LR/RR`, muso verso +Z, in metri.

- Carrozzerie GT3 (`public/models/gt3/*.glb`, categoria `gt3` in `src/data/parts.js`): vengono dalla categoria "GT3 NSR" di unnerdemezzo/Slot-Car, solo dettaglio vicino, WebP 1024, vertici quantizzati; le correzioni materiali di Slot-Car sono già incorporate nei file, quindi niente ritocchi nel codice. Muso verso +X (MiniZCar le ruota di -90°), nodi `WheelFL/FR/RL/RR`. Ogni GT3 ha il suo `wheelbaseMm` (passo Mini-Z MR-04 W-MM 90/94, 98 per la BMW M4): la carrozzeria è scalata perché i suoi assi cadano su quelli del telaio, il telaio MR-04 viene ricostruito con quel passo e la fisica di sterzo usa `car.wheelbase`. Gli avversari corrono con auto della stessa categoria del giocatore. `prepareHypercarBody(root, { keepAllParts: true })` per le GT3: i filtri delle Hypercar nasconderebbero adesivi e vetri.

- Le auto si toccano davvero: `src/car/CarContacts.js` (capsule in pianta, impulsi a masse uguali) risolto ogni fotogramma da `ClubEnvironment.resolveCarContacts()`, per giocatore e avversari. Gli avversari evitano/sorpassano chi hanno davanti.
- Griglia di partenza: `ClubEnvironment.gridSlot(k)` (0 = pole del giocatore, file sfalsate ogni 30 cm). I giri degli avversari si contano sotto il ponte (`lapLineT`).
- Audio: ogni auto ha il suo motore con panner 3D (`SoundAndCommentary.createEngine`), l'ascoltatore è la telecamera.
- Voce telecronista: nella scelta ci sono Alice (predefinita) e le altre voci femminili, più "Voce di Slot Car", la voce maschile scelta con la stessa regola di Slot-Car (`js/commentary.js`: voce italiana predefinita del sistema, poi locale, poi la prima; velocità 1,04). Le altre voci maschili sono escluse (`SoundAndCommentary.isMaleVoice`).
- Vista dal palco: il campo visivo viene da Menu → scheda 5 "Schermo" (misura, formato, distanza, zoom), `getStandFov()` in `src/main.js`.
