# Pilota realistico per Slot Club

Fonte: [Microsoft Rocketbox — Male Adult 11](https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9/Assets/Avatars/Adults/Male_Adult_11).
Commit sorgente: `0943055db6ec570bcef9f2c8b41c9e5467c808f9`.
Copyright (c) 2020 Microsoft. Licenza MIT: [LICENSE.txt](LICENSE.txt).
La licenza si applica anche all'asset: il README upstream documenta il passaggio della libreria alla MIT nel novembre 2020.

## Adattamenti

- Importazione di `Export/Male_Adult_11.fbx` con Three.js 0.160.0; altezza normalizzata a 1,75 m e fronte verso -Z.
- Posizione delle braccia adattata alla guida slot; pulsante aggiunto e collegato all'osso della mano destra. Rimosse luci e animazione di importazione.
- `m001_body_color.tga` e `m001_head_color.tga` riunite in un atlante JPEG 1024×512, con margini per il filtraggio. Un solo materiale per il corpo; nessuna normal map e nessuna morph target.
- Vertici coincidenti saldati, 6.740 triangoli da vicino. Secondo livello da 2.100 triangoli prodotto con meshoptimizer 0.24.0 (errore relativo misurato 0,002062), attributi compattati e stesso scheletro/materiale.
- Movimento leggero dello scheletro gestito da `js/realistic-pilot.js`; non è una simulazione muscolare o una camminata da motion capture.
- Asset autonomo, texture incorporata: nessun servizio esterno per scaricare il personaggio durante il gioco.
- Il cast usa cinque identità, ognuna ripetuta due volte, definite in `js/character-cast.js`. Le vecchie ricolorazioni restano compatibili; solo `marshal.jpg` è utilizzata dal cast attuale.

## Modelli distinti

Tutti provengono dallo stesso commit Microsoft Rocketbox indicato sopra e sono coperti dalla stessa licenza MIT.

| Asset | Cartella sorgente | Triangoli vicino / lontano | Byte GLB |
|---|---|---:|---:|
| pilot | Male_Adult_11 | 6740 / 2100 | 579576 |
| ponytail | Female_Adult_01 | 6740 / 2100 | 1509808 |
| cropped | Male_Adult_12 | 6722 / 2099 | 598212 |
| receding | Male_Adult_14 | 6740 / 2100 | 625424 |
| longhair | Female_Adult_03 | 6740 / 2100 | 1681584 |
| ninco-paolo | Male_Adult_01 | 6740 / 2100 | 1489988 |
| ninco-enrico | Male_Adult_02 | 6740 / 2100 | 1420964 |
| ninco-davide | Male_Adult_03 | 6740 / 2099 | 1612352 |

La Ninco usa otto identità distinte, sei uomini e due donne, in `NINCO_DRIVER_CAST`. I tre nuovi uomini provengono dallo stesso commit e mantengono i propri volti e vestiti originali, con atlante PNG 1024×1024 per le parti con opacità. I cinque modelli precedenti restano disponibili per la sala legno. Nessun modello è duplicato tra gli otto piloti Ninco. Anteprima CPU delle otto geometrie con le texture effettive: `node scripts/review-ninco-drivers.mjs` → `docs/ninco-drivers-2.24.3.jpg`. Gli otto GLB pesano complessivamente 9.517.908 byte; `test:cast` verifica tutte le identità e le diciotto pose usate nei due cast.

I nuovi modelli seguono la stessa conversione, mantenendo il bordo delle parti nel LOD vicino. I capelli femminili usano alpha test e materiale a due facce con atlante PNG 1024×1024; gli altri un JPEG 1024×512. Ogni GLB include corpo, LOD e pulsante da 296 triangoli, nascosto sulle persone in piedi.

Per rigenerare: installare le dipendenze npm e Pillow, preparare una cartella per ogni modello con `source.fbx` e `body.tga`, `head.tga`, più `opacity.tga` per le donne. I file originali si trovano in `Assets/Avatars/Adults/<modello>/Export/`: prefissi texture `f001`, `f003`, `m007`, `m012`, rispettivamente. Rinominare `<prefisso>_<parte>_color.tga` in `<parte>.tga`.

Eseguire `node scripts/build-character.mjs Female_Adult_01 /percorso/sorgenti/Female_Adult_01` per ciascun modello, poi `python scripts/pack-characters.py /percorso/sorgenti`. Non sono richiesti i file sorgente per giocare.

## Prestazioni e verifica

`js/recovery-hand.js` deriva mano destra e avambraccio dalla stessa mesh, usando i pesi delle ossa per selezionare la geometria. Due pose vengono calcolate una volta e interpolate durante la presa. UV e materiale originale sono condivisi; una manica con fascia chiara copre il taglio al gomito. Il braccio completo usa 1.052 triangoli e due mesh. Non viene scaricato un secondo modello.

Incluso il pulsante: **7.036 triangoli e 2 mesh** da vicino, **2.396 triangoli e 2 mesh** da lontano; originale **9.652 triangoli e 39 mesh**. Gli altri personaggi non disegnano il pulsante. Due commissari aggiungono un gilet condiviso da 292 triangoli e una mesh. I cinque GLB pesano **4.994.604 byte** (4,76 MiB), più il piccolo atlante marshal. Il conteggio del pilota base sopra resta valido; gli altri corpi hanno budget simile. I capelli alpha test e il gilet possono cambiare il costo GPU. Sono conteggi strutturali, non una misura degli FPS della gara completa.

Il cambio LOD avviene tra 5,1 e 5,9 m (isteresi). Animazione aggiornata a 30 Hz da vicino e 12 Hz da lontano, sospesa quando il pilota è nascosto. Il rendering continua alla frequenza del gioco.

`npm install`, `npm run test:pilot` e `npm run test:cast` (Node 22 o successivo) verificano geometria reale, pesi della pelle, clonazione indipendente delle ossa, LOD, coordinate dopo l'animazione, singolo caricamento condiviso e fallback in caso di rete assente. Non misurano FPS e non sostituiscono una prova WebGL.

`/personaggi.html` contiene un confronto visivo e un test locale di 14 secondi: originale e realistico vengono renderizzati uno alla volta, a camera, luci e risoluzione costanti. Per ciascuno: 2 secondi di preparazione e 5 di campionamento dei tempi tra fotogrammi. Il test si annulla se la scheda viene nascosta o ridimensionata. Riporta FPS medi e frame time p95 della scena di confronto; non sono GPU time né FPS della gara completa. Ripetere il test per distinguere differenze reali da rumore, sincronizzazione del display e variazioni termiche.

Per la gara completa usare `/?debug&q=media&pilot=original` e `/?debug&q=media&pilot=realistic` con la stessa configurazione e telecamera. Ora le due opzioni cambiano tutti e dieci i personaggi. Controllare che la qualità non venga ridotta automaticamente dal gioco durante il confronto.


## Nuovi meccanici · v2.23.1

Enzo, Leo, Karim e Marco usano l’anatomia e lo scheletro MIT di `pilot.glb`, con proporzioni del volto leggermente diverse. Le quattro texture `mechanic-*.png` sono state create con il generatore di immagini integrato, modificando l’atlante esistente e preservando la disposizione UV. Prompt: nuovi volti fotografici distinti dal cast, età, capelli, barba, carnagioni e abiti da lavoro diversi, mani realistiche e nessun logo. Lo scheletro, i movimenti e la presa sono gestiti localmente in `js/pit-crew.js`; nessuna chiamata al generatore avviene durante il gioco.
