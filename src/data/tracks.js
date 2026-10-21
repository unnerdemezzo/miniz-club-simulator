// Tracciati Kyosho RCP Track posizionati sulla pedana in moquette verde del Club Mini-Z
// Pedana verde: x da -2.8 a +7.7 (centro x = 2.45), z da -5.0 a +1.15 (centro z = -1.92), altezza y = 0.00m
// Palco Piloti: x da 0.3 a 6.4, z da 1.55 a 2.35, pedana top = -0.40m, occhi pilota a y = +1.24m, z = 1.91m

export const TRACK_LAYOUTS = [
  {
    id: 'club_veloce',
    name: '1. Circuito Club Veloce (RCP Wide-L)',
    dimensionsLabel: '9,2m × 5,2m • Mattonelle Kyosho RCP Grigio Antracite (50×50cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.84,
    gripMultiplier: 1.06,
    description: 'Lungo rettilineo fronte palco piloti, curvone veloce a destra, tornante centrale e chicane scorrevole.',
    waypoints: [
      { x: -0.60, z:  0.35 },
      { x:  1.00, z:  0.35 },
      { x:  2.60, z:  0.35 },
      { x:  4.20, z:  0.35 },
      { x:  5.55, z:  0.35 },
      { x:  6.45, z: -0.25 },
      { x:  6.60, z: -1.50 },
      { x:  6.45, z: -2.80 },
      { x:  5.60, z: -3.75 },
      { x:  4.30, z: -3.85 },
      { x:  3.35, z: -2.90 },
      { x:  2.45, z: -2.45 },
      { x:  1.55, z: -2.90 },
      { x:  0.60, z: -3.85 },
      { x: -0.75, z: -3.85 },
      { x: -1.60, z: -2.85 },
      { x: -1.65, z: -1.45 },
      { x: -1.40, z: -0.25 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Rettilineo & Palco', x: -2.2, y: 0.85, z: 0.95 },
      { name: 'TV Staccata Curva 1', x: 7.1, y: 0.75, z: 0.85 },
      { name: 'TV Tornante Centrale', x: 2.45, y: 0.90, z: -4.65 },
      { name: 'TV Uscita Rettilineo', x: -2.3, y: 0.70, z: -3.85 }
    ]
  },
  {
    id: 'tecnico_misto',
    name: '2. Circuito Tecnico Misto (Chicane & Tornanti)',
    dimensionsLabel: '9,4m × 5,4m • Mattonelle Kyosho RCP Grigio Antracite (50×50cm)',
    surfaceType: 'rcp_grip',
    laneWidth: 0.78,
    gripMultiplier: 1.04,
    description: 'Rettilineo veloce fronte palco seguito da una serpentina tecnica dove contano inserimento, gomme anteriori e molle.',
    waypoints: [
      { x: -0.60, z:  0.35 },
      { x:  1.00, z:  0.35 },
      { x:  2.60, z:  0.35 },
      { x:  4.20, z:  0.35 },
      { x:  5.55, z:  0.35 },
      { x:  6.45, z: -0.35 },
      { x:  6.50, z: -1.65 },
      { x:  5.60, z: -2.65 },
      { x:  4.35, z: -3.55 },
      { x:  3.05, z: -3.75 },
      { x:  2.05, z: -2.95 },
      { x:  1.05, z: -2.65 },
      { x: -0.05, z: -3.45 },
      { x: -1.15, z: -3.65 },
      { x: -1.65, z: -2.55 },
      { x: -1.65, z: -1.35 },
      { x: -1.35, z: -0.25 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Tribuna Palco', x: -2.1, y: 0.85, z: 0.95 },
      { name: 'TV Serpentina Interna', x: 7.0, y: 0.95, z: -2.10 },
      { name: 'TV Doppio Tornante', x: 1.5, y: 0.80, z: -4.65 },
      { name: 'TV Ultima Curva', x: -2.2, y: 0.75, z: 0.50 }
    ]
  },
  {
    id: 'miniz_cup_gp',
    name: '3. Pista Mini-Z Cup Ufficiale (Grand Prix)',
    dimensionsLabel: '9,6m × 5,5m • Tracciato Nazionale Kyosho Cup',
    surfaceType: 'rcp_grip',
    laneWidth: 0.80,
    gripMultiplier: 1.08,
    description: 'Tracciato ufficiale da campionato: rettilineo velocissimo davanti al palco, chicane sui cordoli e parabolica finale.',
    waypoints: [
      { x: -0.60, z:  0.35 },
      { x:  1.00, z:  0.35 },
      { x:  2.60, z:  0.35 },
      { x:  4.20, z:  0.35 },
      { x:  5.60, z:  0.35 },
      { x:  6.50, z: -0.35 },
      { x:  6.55, z: -1.65 },
      { x:  5.65, z: -2.65 },
      { x:  4.35, z: -2.45 },
      { x:  3.35, z: -3.15 },
      { x:  2.25, z: -3.95 },
      { x:  1.05, z: -3.55 },
      { x: -0.15, z: -3.85 },
      { x: -1.35, z: -3.35 },
      { x: -1.70, z: -2.05 },
      { x: -1.45, z: -0.35 }
    ],
    bridgeProgress: 0.14,
    tvCameras: [
      { name: 'TV Main Straight GP', x: -2.3, y: 0.80, z: 0.95 },
      { name: 'TV Curvone Veloce', x: 7.1, y: 0.85, z: -2.50 },
      { name: 'TV Chicane Centrale', x: 2.45, y: 0.75, z: -4.65 },
      { name: 'TV Parabolica', x: -2.3, y: 0.85, z: -2.85 }
    ]
  },
  {
    id: 'arena_drift',
    name: '4. Arena Drift AWD (Traversi Continui)',
    dimensionsLabel: '9,0m × 5,2m • Superficie Larga Drift Spec',
    surfaceType: 'drift_carpet',
    laneWidth: 0.90,
    gripMultiplier: 0.70,
    description: 'Pista larga a basso attrito pensata per telai 4x4 (MA-030) e gomme Drift: collega le curve in un unico traverso continuo!',
    waypoints: [
      { x: -0.50, z:  0.32 },
      { x:  1.10, z:  0.32 },
      { x:  2.60, z:  0.32 },
      { x:  4.10, z:  0.32 },
      { x:  5.45, z:  0.32 },
      { x:  6.35, z: -0.45 },
      { x:  6.40, z: -1.95 },
      { x:  5.55, z: -3.45 },
      { x:  4.15, z: -3.85 },
      { x:  2.65, z: -2.95 },
      { x:  1.35, z: -3.75 },
      { x: -0.25, z: -3.85 },
      { x: -1.45, z: -2.85 },
      { x: -1.60, z: -1.45 },
      { x: -1.35, z: -0.35 }
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
