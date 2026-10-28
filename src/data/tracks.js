// Tracciati Kyosho RCP Track posizionati sulla pedana del Club Mini-Z
// Tavolo pista: x da -2.8 a +7.7 (centro x = 2.45), z da -5.0 a +1.15 (centro z = -1.92)
// Ogni circuito ha una geometria, uno sviluppo e un carattere di guida completamente diversi!

export const TRACK_LAYOUTS = [
  {
    id: 'club_veloce',
    name: '1. Circuito Club Veloce (RCP High-Speed)',
    dimensionsLabel: '9,2m × 5,0m • Sviluppo 23m • Veloce e Scorrevole (Corsia 88 cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.88,
    gripMultiplier: 1.06,
    description: 'Tracciato ad altissima scorrevolezza: lungo rettilineo fronte palco, grande curvone parabolico a destra, piega veloce centrale e staccata finale.',
    waypoints: [
      { x: -1.10, z:  0.40 },
      { x:  0.80, z:  0.40 },
      { x:  2.65, z:  0.40 },
      { x:  4.50, z:  0.40 },
      { x:  6.00, z:  0.35 },
      { x:  6.85, z: -0.45 },
      { x:  6.95, z: -1.85 },
      { x:  6.65, z: -3.25 },
      { x:  5.55, z: -4.15 },
      { x:  4.00, z: -4.10 },
      { x:  2.55, z: -3.15 },
      { x:  1.05, z: -4.10 },
      { x: -0.60, z: -4.15 },
      { x: -1.75, z: -3.35 },
      { x: -2.05, z: -1.85 },
      { x: -1.85, z: -0.35 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Rettilineo & Palco', x: -2.2, y: 0.85, z: 0.95 },
      { name: 'TV Staccata Curva 1', x: 7.1, y: 0.75, z: 0.85 },
      { name: 'TV Piega Veloce', x: 2.45, y: 0.90, z: -4.65 },
      { name: 'TV Uscita Rettilineo', x: -2.3, y: 0.70, z: -3.85 }
    ]
  },
  {
    id: 'tecnico_misto',
    name: '2. Circuito Tecnico Misto (Doppio Tornante & Infield)',
    dimensionsLabel: '9,4m × 5,3m • Sviluppo 28m • Tecnico e Guidato (Corsia 76 cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.76,
    gripMultiplier: 1.05,
    description: 'Tracciato tecnico a doppia ansa profonda con tornante centrale ravvicinato al palco: esalta inserimento, gomme anteriori 30° e rotazione a centro curva.',
    waypoints: [
      { x: -1.10, z:  0.40 },
      { x:  0.80, z:  0.40 },
      { x:  2.65, z:  0.40 },
      { x:  4.50, z:  0.40 },
      { x:  6.05, z:  0.35 },
      { x:  6.90, z: -0.45 },
      { x:  6.95, z: -1.95 },
      { x:  6.55, z: -3.45 },
      { x:  5.45, z: -4.25 },
      { x:  4.25, z: -3.95 },
      { x:  3.65, z: -2.45 },
      { x:  3.05, z: -1.45 },
      { x:  1.85, z: -1.45 },
      { x:  1.25, z: -2.45 },
      { x:  0.65, z: -3.95 },
      { x: -0.55, z: -4.25 },
      { x: -1.75, z: -3.45 },
      { x: -2.05, z: -1.95 },
      { x: -1.85, z: -0.35 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Tribuna Palco', x: -2.1, y: 0.85, z: 0.95 },
      { name: 'TV Ansa Destra', x: 7.0, y: 0.95, z: -2.10 },
      { name: 'TV Tornante Centrale', x: 2.45, y: 0.80, z: -4.65 },
      { name: 'TV Ansa Sinistra', x: -2.2, y: 0.75, z: 0.50 }
    ]
  },
  {
    id: 'miniz_cup_gp',
    name: '3. Pista Kyosho Mini-Z Cup GP (Campionato Nazionale)',
    dimensionsLabel: '9,6m × 5,4m • Sviluppo 32m • Infield Hairpin & Chicane (Corsia 74 cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.74,
    gripMultiplier: 1.08,
    description: 'Layout ufficiale da gara nazionale: lungo rettilineo sotto al palco, tornante a U con contro-rettilineo interno, tornante centrale e allungo posteriore.',
    waypoints: [
      { x: -1.10, z:  0.42 },
      { x:  0.80, z:  0.42 },
      { x:  2.65, z:  0.42 },
      { x:  4.50, z:  0.42 },
      { x:  6.10, z:  0.38 },
      { x:  6.95, z: -0.25 },
      { x:  6.90, z: -1.30 },
      { x:  5.75, z: -1.60 },
      { x:  3.85, z: -1.60 },
      { x:  2.05, z: -1.65 },
      { x:  1.25, z: -2.00 },
      { x:  1.25, z: -2.75 },
      { x:  2.05, z: -3.10 },
      { x:  4.25, z: -3.00 },
      { x:  5.85, z: -3.00 },
      { x:  6.65, z: -3.40 },
      { x:  6.65, z: -4.05 },
      { x:  5.75, z: -4.35 },
      { x:  3.55, z: -4.35 },
      { x:  1.15, z: -4.30 },
      { x: -0.95, z: -4.25 },
      { x: -1.95, z: -3.45 },
      { x: -2.05, z: -1.85 },
      { x: -1.85, z: -0.30 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Main Straight GP', x: -2.3, y: 0.80, z: 0.95 },
      { name: 'TV Contro-Rettilineo', x: 7.1, y: 0.85, z: -2.50 },
      { name: 'TV Tornante Infield', x: 2.45, y: 0.75, z: -4.65 },
      { name: 'TV Parabolica Finale', x: -2.3, y: 0.85, z: -2.85 }
    ]
  },
  {
    id: 'arena_drift',
    name: '4. Arena Drift AWD (S-Wave & Transizione Larga)',
    dimensionsLabel: '9,0m × 5,2m • Corsia Extra-Larga 94 cm • Tappeto Drift Spec',
    surfaceType: 'drift_carpet',
    laneWidth: 0.94,
    gripMultiplier: 0.72,
    description: 'Circuito largo a raggio diagonale studiato per il pendolo in derapata AWD: grande inserimento obliquo, transizione S-Wave al centro e lungo clipping point.',
    waypoints: [
      { x: -0.80, z:  0.38 },
      { x:  0.95, z:  0.38 },
      { x:  2.65, z:  0.38 },
      { x:  4.45, z:  0.38 },
      { x:  6.05, z:  0.22 },
      { x:  6.85, z: -0.95 },
      { x:  6.45, z: -2.45 },
      { x:  4.95, z: -2.85 },
      { x:  3.35, z: -2.15 },
      { x:  1.85, z: -3.45 },
      { x:  0.25, z: -4.25 },
      { x: -1.25, z: -3.95 },
      { x: -2.05, z: -2.55 },
      { x: -1.85, z: -0.85 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Drift Ingresso', x: 6.9, y: 0.75, z: 0.80 },
      { name: 'TV Clipping Point 1', x: 6.8, y: 0.65, z: -3.85 },
      { name: 'TV Pendolo Centrale', x: 2.45, y: 0.90, z: -4.65 },
      { name: 'TV Clipping Point 2', x: -2.2, y: 0.70, z: -3.55 }
    ]
  }
];
