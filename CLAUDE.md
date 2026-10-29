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

L'app si apre sulla schermata **Impostazioni gara** (`#race-setup-screen`, `showRaceSetup()` in `src/main.js`): l'auto non è in pista finché non si preme INIZIA. Poi semaforo (`beginRace()`), gara (`racePhase === 'racing'`) e risultati (`finishRace()`). Il pulsante "Installa App" compare nella schermata iniziale finché l'app non è installata ed è sempre facoltativo.

## Auto in pista

- Le auto si toccano davvero: `src/car/CarContacts.js` (capsule in pianta, impulsi a masse uguali) risolto ogni fotogramma da `ClubEnvironment.resolveCarContacts()`, per giocatore e avversari. Gli avversari evitano/sorpassano chi hanno davanti.
- Griglia di partenza: `ClubEnvironment.gridSlot(k)` (0 = pole del giocatore, file sfalsate ogni 30 cm). I giri degli avversari si contano sotto il ponte (`lapLineT`).
- Audio: ogni auto ha il suo motore con panner 3D (`SoundAndCommentary.createEngine`), l'ascoltatore è la telecamera.
- Vista dal palco: il campo visivo viene da Menu → scheda 5 "Schermo" (misura, formato, distanza, zoom), `getStandFov()` in `src/main.js`.
