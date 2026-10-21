// Tracciati Kyosho RCP Track in scala reale 1:1 (1 unità = 1 metro)
// Il Palco di Guida si trova a z = +2.45m e guarda verso -Z (il centro pista).
// Il Rettilineo Principale passa proprio sotto gli occhi del pilota a z = +1.42m!

export const TRACK_LAYOUTS = [
  {
    id: 'club_veloce',
    name: '1. Circuito Club Veloce (RCP Wide-L)',
    dimensionsLabel: '6,0m × 4,0m • 96 Mattonelle RCP (50×50cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.92, // 92 cm di larghezza corsia (circa 2 mattonelle RCP)
    gripMultiplier: 1.05,
    description: 'Rettilineo lungo 5 metri proprio sotto al palco di guida, curvone veloce di lancio, tornante centrale e chicane scorrevole.',
    // Punti della linea centrale (chiusa) in metri reali (X da -2.6 a +2.6, Z da -1.65 a +1.42)
    waypoints: [
      { x: -2.10, z:  1.42 }, // Rettilineo sotto il palco (ingresso)
      { x:  0.00, z:  1.42 }, // Passaggio sotto il ponte cronometraggio
      { x:  2.15, z:  1.42 }, // Fine rettilineo sotto il palco
      { x:  2.55, z:  0.90 }, // Staccata Curva 1 a destra
      { x:  2.45, z: -0.20 }, // Allungo laterale destro
      { x:  2.20, z: -1.35 }, // Curvone in fondo a destra
      { x:  1.10, z: -1.45 }, // Breve rettilineo opposto
      { x:  0.55, z: -0.45 }, // Ingresso tornante interno
      { x: -0.15, z: -0.20 }, // Apice tornante centrale
      { x: -0.75, z: -1.35 }, // Uscita verso sinistra in fondo
      { x: -2.05, z: -1.40 }, // Curvone sinistro in fondo
      { x: -2.50, z: -0.45 }, // Esse veloce di ritorno
      { x: -2.50, z:  0.80 }  // Ultima curva che immette sul rettilineo del palco
    ],
    bridgeProgress: 0.09, // Posizione del ponte cronometraggio sul rettilineo principale
    marshalPositions: [
      { x:  3.25, z:  1.15, lookAt: { x:  2.2, z:  0.8 } },
      { x:  2.95, z: -1.85, lookAt: { x:  1.8, z: -1.2 } },
      { x: -0.10, z: -2.05, lookAt: { x: -0.2, z: -0.8 } },
      { x: -3.25, z: -0.20, lookAt: { x: -2.2, z:  0.0 } }
    ],
    tvCameras: [
      { name: 'TV Rettilineo & Palco', x: -3.1, y: 0.65, z: 1.85 },
      { name: 'TV Staccata Curva 1', x: 3.1, y: 0.55, z: 1.75 },
      { name: 'TV Tornante Centrale', x: 0.1, y: 0.70, z: -2.15 },
      { name: 'TV Uscita Rettilineo', x: -3.1, y: 0.50, z: -1.65 }
    ]
  },
  {
    id: 'tecnico_misto',
    name: '2. Circuito Tecnico Misto (Chicane & Tornanti)',
    dimensionsLabel: '6,2m × 4,2m • 104 Mattonelle RCP (50×50cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.84, // Corsia più tecnica da 84 cm
    gripMultiplier: 1.02,
    description: 'Rettilineo veloce sotto il palco seguito da una serpentina tecnica dove contano tantissimo le gomme anteriori e le molle.',
    waypoints: [
      { x: -2.20, z:  1.45 },
      { x:  0.00, z:  1.45 },
      { x:  2.25, z:  1.45 },
      { x:  2.60, z:  0.85 },
      { x:  2.45, z:  0.10 },
      { x:  1.25, z:  0.15 }, // Prima piega interna
      { x:  1.15, z: -1.35 }, // Allungo verso il fondo
      { x:  0.10, z: -1.48 }, // Tornante stretto centrale
      { x: -0.15, z: -0.25 }, // Risalita centrale
      { x: -1.25, z: -0.20 }, // Cambio di direzione
      { x: -1.40, z: -1.42 }, // Affondo sinistro
      { x: -2.45, z: -1.35 }, // Tornante sinistro
      { x: -2.55, z:  0.75 }
    ],
    bridgeProgress: 0.08,
    marshalPositions: [
      { x:  3.25, z:  0.65, lookAt: { x:  2.2, z:  0.5 } },
      { x:  1.85, z: -2.05, lookAt: { x:  0.8, z: -1.2 } },
      { x: -1.85, z: -2.05, lookAt: { x: -1.5, z: -1.1 } },
      { x: -3.25, z:  0.40, lookAt: { x: -2.3, z:  0.4 } }
    ],
    tvCameras: [
      { name: 'TV Tribuna Palco', x: -2.9, y: 0.65, z: 1.90 },
      { name: 'TV Serpentina Interna', x: 2.8, y: 0.75, z: -0.80 },
      { name: 'TV Doppio Tornante', x: -0.5, y: 0.60, z: -2.15 },
      { name: 'TV Ultima Curva', x: -3.1, y: 0.55, z: 0.90 }
    ]
  },
  {
    id: 'miniz_cup_gp',
    name: '3. Pista Mini-Z Cup Ufficiale (Grand Prix)',
    dimensionsLabel: '6,6m × 4,4m • 116 Mattonelle RCP Da Gara',
    surfaceType: 'rcp_grip',
    laneWidth: 0.90,
    gripMultiplier: 1.08,
    description: 'Tracciato ufficiale da campionato: rettilineo velocissimo sotto il palco, chicane sui cordoli bianchi/rossi e parabolica finale.',
    waypoints: [
      { x: -2.35, z:  1.45 },
      { x:  0.00, z:  1.45 },
      { x:  2.40, z:  1.45 },
      { x:  2.75, z:  0.75 },
      { x:  2.55, z: -1.30 }, // Curvone veloce destro
      { x:  1.50, z: -1.55 },
      { x:  0.75, z: -0.95 }, // Chicane veloce entrata
      { x: -0.05, z: -1.52 }, // Chicane veloce uscita
      { x: -0.95, z: -0.90 },
      { x: -1.85, z: -1.50 },
      { x: -2.65, z: -1.05 }, // Parabolica sinistra
      { x: -2.70, z:  0.75 }
    ],
    bridgeProgress: 0.08,
    marshalPositions: [
      { x:  3.35, z:  0.20, lookAt: { x:  2.5, z:  0.0 } },
      { x:  2.10, z: -2.10, lookAt: { x:  1.0, z: -1.2 } },
      { x: -0.90, z: -2.10, lookAt: { x: -0.5, z: -1.2 } },
      { x: -3.35, z: -0.20, lookAt: { x: -2.5, z: -0.2 } }
    ],
    tvCameras: [
      { name: 'TV Main Straight GP', x: -3.2, y: 0.60, z: 1.85 },
      { name: 'TV Curvone Biassono', x: 3.2, y: 0.65, z: -1.50 },
      { name: 'TV Chicane Centrale', x: 0.0, y: 0.50, z: -2.15 },
      { name: 'TV Parabolica', x: -3.3, y: 0.65, z: -1.25 }
    ]
  },
  {
    id: 'arena_drift',
    name: '4. Arena Drift AWD (Traversi Continui)',
    dimensionsLabel: '5,8m × 3,9m • Superficie Liscia Drift Spec',
    surfaceType: 'drift_carpet',
    laneWidth: 1.08, // Corsia molto larga (oltre 1 metro) per mettersi di traverso!
    gripMultiplier: 0.68,
    description: 'Pista larga a basso attrito pensata per telai 4x4 (MA-030) e gomme Drift: collega le curve in un unico traverso fumante!',
    waypoints: [
      { x: -1.95, z:  1.38 },
      { x:  0.00, z:  1.38 },
      { x:  1.95, z:  1.38 },
      { x:  2.45, z:  0.55 },
      { x:  2.15, z: -1.15 },
      { x:  0.90, z: -1.35 },
      { x:  0.00, z: -0.25 }, // Grande anello centrale da raccordare in pendolo
      { x: -0.95, z: -1.35 },
      { x: -2.15, z: -1.15 },
      { x: -2.45, z:  0.55 }
    ],
    bridgeProgress: 0.09,
    marshalPositions: [
      { x:  3.15, z:  0.80, lookAt: { x:  2.1, z:  0.4 } },
      { x:  1.80, z: -1.98, lookAt: { x:  1.1, z: -1.1 } },
      { x: -1.80, z: -1.98, lookAt: { x: -1.1, z: -1.1 } },
      { x: -3.15, z:  0.80, lookAt: { x: -2.1, z:  0.4 } }
    ],
    tvCameras: [
      { name: 'TV Drift Ingresso', x: 2.9, y: 0.55, z: 1.60 },
      { name: 'TV Clipping Point 1', x: 2.6, y: 0.45, z: -1.65 },
      { name: 'TV Pendolo Centrale', x: 0.0, y: 0.70, z: -2.05 },
      { name: 'TV Clipping Point 2', x: -2.8, y: 0.50, z: -1.55 }
    ]
  }
];
