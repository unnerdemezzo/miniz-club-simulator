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

- Qualità visiva delle auto: in Alta la risoluzione arriva alla densità reale dello schermo (fino a 3×/4K, come Slot-Car) e scende da sola fino al livello di Media se in gara si va sotto 28 FPS (`monitor()` in `src/club/graphics-quality.js`). Filtro anisotropico al massimo della GPU su tutte le mappe delle carrozzerie. Livree HD 2048 px (`public/models/hd/*-livrea.webp`, ricavate dagli originali) caricate solo in Alta da `src/car/hd-livery.js` per Alpine, BMW e Aston Martin; per aggiungerne una servono l'originale a risoluzione maggiore e il nome del materiale della livrea.

- Carrozzerie GT3 (`public/models/gt3/*.glb`, categoria `gt3` in `src/data/parts.js`): vengono dalla categoria "GT3 NSR" di unnerdemezzo/Slot-Car, solo dettaglio vicino, WebP 1024, vertici quantizzati; le correzioni materiali di Slot-Car sono già incorporate nei file, quindi niente ritocchi nel codice. Muso verso +X (MiniZCar le ruota di -90°), nodi `WheelFL/FR/RL/RR`. Ogni GT3 ha il suo `wheelbaseMm` (passo Mini-Z MR-04 W-MM 90/94, 98 per la BMW M4): la carrozzeria è scalata perché i suoi assi cadano su quelli del telaio, il telaio MR-04 viene ricostruito con quel passo e la fisica di sterzo usa `car.wheelbase`. Gli avversari corrono con auto della stessa categoria del giocatore. `prepareHypercarBody(root, { keepAllParts: true })` per le GT3: i filtri delle Hypercar nasconderebbero adesivi e vetri.

- Le auto si toccano davvero: `src/car/CarContacts.js` (capsule in pianta, impulsi a masse uguali) risolto ogni fotogramma da `ClubEnvironment.resolveCarContacts()`, per giocatore e avversari. Gli avversari evitano/sorpassano chi hanno davanti (`animateCharacters()`, blocco "Traffico"): distanze in coordinate di pista (`trackCoordsNear()` per il giocatore), frenano solo per chi è davvero sulla loro linea, tengono il lato scelto per il sorpasso (`passHold`), lasciano spazio a chi è affiancato e, col muso contro un'auto ferma, fanno un po' di retromarcia. Lo spostamento laterale è limitato dallo sterzo e il muso segue la direzione di marcia (`laneRate`, `steerYaw`): niente scivolate di lato.
- Griglia di partenza stile F1: `ClubEnvironment.gridSlot(k)` (0 = pole del giocatore) dà la posizione k, due colonne sfalsate ogni 24 cm, pole all'interno della prima curva (`firstCornerSide`), piazzola della pole 4 cm dietro la linea bianca di partenza (15 cm prima del traguardo). `buildGridMarks()` disegna da lì linea e 10 piazzole numerate su ogni pista e in entrambi i sensi: le auto in gara usano le stesse posizioni. I giri degli avversari si contano sotto il ponte (`lapLineT`).
- Audio: ogni auto ha il suo motore con panner 3D (`SoundAndCommentary.createEngine`), l'ascoltatore è la telecamera.
- Voce telecronista: nella scelta ci sono Alice (predefinita) e le altre voci femminili, più "Voce di Slot Car", la voce maschile scelta con la stessa regola di Slot-Car (`js/commentary.js`: voce italiana predefinita del sistema, poi locale, poi la prima; velocità 1,04). Le altre voci maschili sono escluse (`SoundAndCommentary.isMaleVoice`).
- Vista dal palco: il campo visivo viene da Menu → scheda 5 "Schermo" (misura, formato, distanza, zoom), `getStandFov()` in `src/main.js`.
