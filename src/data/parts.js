// Tutte le misure fisiche sono in scala reale 1:27 Mini-Z (1 unità 3D = 1 metro reale)
// Lunghezza auto reale: 0.172m (17.2 cm), Larghezza: 0.078m (7.8 cm), Passo: 0.098m (98 mm)

export const REAL_SCALE = {
  CAR_LENGTH: 0.172,
  CAR_WIDTH: 0.078,
  CAR_HEIGHT: 0.047,
  WHEELBASE: 0.098,
  WHEEL_RADIUS: 0.0125, // 25mm diametro ruota Mini-Z
  RCP_TILE_SIZE: 0.50,  // 50cm x 50cm mattonella Kyosho RCP
  BARRIER_HEIGHT: 0.045, // 4.5cm sponda morbida
  STAND_HEIGHT: 0.90,   // 90cm altezza pedana palco
  DRIVER_EYE_HEIGHT: 2.58, // 90cm palco + 168cm occhi pilota
  PERSON_HEIGHT: 1.75,  // 175cm altezza persone reali
  TABLE_HEIGHT: 0.75,   // 75cm altezza tavoli box
  TABLE_WIDTH: 1.20,
  TABLE_DEPTH: 0.60
};

export const CAR_BODIES = [
  {
    id: 'ferrari_499p',
    name: 'Ferrari 499P #51 Rosso Corsa (WEC)',
    scaleLabel: 'Scala 1:27 • Passo 98mm LL (Wide)',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/ferrari_499p.glb',
    liveryTint: '#ffffff',
    defaultColor: '#d40000',
    aeroBonus: 1.12,
    weightBias: 0.98,
    description: 'Modello 3D ufficiale Ferrari 499P Hypercar #51 adattato al telaio Mini-Z LM 98mm con fari LED attivi.'
  },
  {
    id: 'miniz_gt_pro',
    name: 'Ferrari 499P #83 Giallo Modena (AF Corse)',
    scaleLabel: 'Scala 1:27 • Passo 98mm LL (Wide)',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/ferrari_499p.glb',
    liveryTint: '#ffd43b',
    defaultColor: '#facc15',
    accentColor: '#e11d48',
    aeroBonus: 1.08,
    weightBias: 1.0,
    description: 'Carrozzeria 3D Hypercar in livrea speciale Giallo Modena #83 AF Corse per il telaio Mini-Z.'
  },
  {
    id: 'miniz_proto_lm',
    name: 'Ferrari 499P #50 Prototipo Blu Corsa',
    scaleLabel: 'Scala 1:27 • Passo 98mm LL (Ultraleggera)',
    lengthCm: 17.4,
    widthCm: 7.9,
    heightCm: 4.3,
    glbUrl: '/models/ferrari_499p.glb',
    liveryTint: '#38bdf8',
    defaultColor: '#0284c7',
    accentColor: '#38bdf8',
    aeroBonus: 1.15,
    weightBias: 0.94,
    description: 'Carrozzeria 3D Hypercar ribassata in livrea Blu Corsa da gara nazionale Mini-Z Cup.'
  }
];

export const CHASSIS_LIST = [
  {
    id: 'mr04_evo2',
    name: 'Kyosho MR-04 EVO2 (RWD - Trazione Posteriore)',
    driveType: 'RWD',
    frontSplit: 0.0,
    rearSplit: 1.0,
    turnInFactor: 1.18,
    stabilityFactor: 1.05,
    cgHeight: 0.014,
    description: 'Ultimo telaio da gara a trazione posteriore con baricentro ribassato e sterzo ultra-preciso.'
  },
  {
    id: 'mr03_rwd',
    name: 'Kyosho MR-03 Sports (RWD - Trazione Posteriore)',
    driveType: 'RWD',
    frontSplit: 0.0,
    rearSplit: 1.0,
    turnInFactor: 1.06,
    stabilityFactor: 1.0,
    cgHeight: 0.016,
    description: 'Il grande classico dei club Mini-Z: sincero, progressivo e ideale per imparare le traiettorie.'
  },
  {
    id: 'ma030_awd',
    name: 'Kyosho MA-030 EVO (AWD - 4x4 Integrale)',
    driveType: 'AWD',
    frontSplit: 0.42,
    rearSplit: 0.58,
    turnInFactor: 0.98,
    stabilityFactor: 1.22,
    cgHeight: 0.016,
    description: 'Trazione integrale su 4 ruote: stabilissima con gomme in gomma, spettacolare di traverso con gomme Drift!'
  }
];

export const FRONT_TIRES = [
  {
    id: 'front_20_soft',
    name: '20° Super Morbide Low-Profile',
    degree: '20°',
    gripFront: 1.30,
    gripRollRisk: 1.35,
    color: '#1e293b',
    badgeColor: '#ef4444',
    description: 'Inserimento in curva fulmineo! Attenzione sui cordoli: troppa presa può far puntare o cappottare l\'auto.'
  },
  {
    id: 'front_30_med',
    name: '30° Medie Slick da Gara (Consigliate)',
    degree: '30°',
    gripFront: 1.12,
    gripRollRisk: 0.90,
    color: '#1e293b',
    badgeColor: '#3b82f6',
    description: 'Il miglior compromesso sul tappeto RCP: sterzo preciso e sicuro anche sui cordoli veloci.'
  },
  {
    id: 'front_40_hard',
    name: '40° Dure Scorrevoli',
    degree: '40°',
    gripFront: 0.92,
    gripRollRisk: 0.55,
    color: '#1e293b',
    badgeColor: '#10b981',
    description: 'Sterzo più dolce e rotondo, rende la macchina facilissima da guidare e impossibile da cappottare.'
  },
  {
    id: 'front_drift_lf',
    name: 'Gomme Drift LF (Plastica Dura)',
    degree: 'DRIFT',
    gripFront: 0.52,
    gripRollRisk: 0.10,
    color: '#0f172a',
    badgeColor: '#a855f7',
    description: 'Gomme rigide a basso attrito per derapare di traverso lungo tutta la pista!'
  }
];

export const REAR_TIRES = [
  {
    id: 'rear_20_radial',
    name: '20° Radial Wide Super Grip',
    degree: '20°',
    gripRear: 1.34,
    dragFactor: 1.04,
    badgeColor: '#ef4444',
    description: 'Incollata all\'asfalto RCP in uscita di curva, permette di dare tutto gas subito.'
  },
  {
    id: 'rear_30_radial',
    name: '30° Radial Wide Bilanciate',
    degree: '30°',
    gripRear: 1.16,
    dragFactor: 1.00,
    badgeColor: '#3b82f6',
    description: 'Tenuta posteriore costante e leggera rotazione del retrotreno per chiudere meglio i tornanti.'
  },
  {
    id: 'rear_35_slick',
    name: '35° Slick Dura Scorrevole',
    degree: '35°',
    gripRear: 0.96,
    dragFactor: 0.97,
    badgeColor: '#10b981',
    description: 'Lascia scivolare leggermente il posteriore se apri il gas con troppa forza.'
  },
  {
    id: 'rear_drift_lf',
    name: 'Gomme Drift LF Posteriori (Plastica)',
    degree: 'DRIFT',
    gripRear: 0.44,
    dragFactor: 0.92,
    badgeColor: '#a855f7',
    description: 'Innesca traversi continui appena tocchi il grilletto del gas (ideale con telaio MA-030 AWD).'
  }
];

export const MOTORS = [
  {
    id: 'stock_brushed',
    name: 'Kyosho MZ9P Stock (A Spazzole)',
    kvLabel: 'Stock Classe Box (~14 km/h reali)',
    colorHex: '#94a3b8',
    maxSpeedMs: 3.85, // ~13.9 km/h reali (375 km/h in scala 1:27: la vera velocità di una Mini-Z Box Stock su RCP!)
    accelMs2: 5.2,
    motorBrake: 0.92,
    pitchBase: 260,
    description: 'Erogazione morbida, progressiva e gestibile: la vera velocità delle gare Mini-Z Box Stock.'
  },
  {
    id: 'xspeed_green_4100',
    name: 'SPEED HOUSE X-Speed 41 (Verde - 4100KV)',
    kvLabel: '4100KV Brushless (~16 km/h reali)',
    colorHex: '#22c55e',
    maxSpeedMs: 4.45, // ~16.0 km/h reali
    accelMs2: 6.4,
    motorBrake: 1.0,
    pitchBase: 320,
    description: 'Motore Brushless da gara categoria Novice/Stock: spinta fluida sul rettilineo e consumi ridotti.'
  },
  {
    id: 'xspeed_blue_5600',
    name: 'SPEED HOUSE X-Speed 56 (Blu - 5600KV)',
    kvLabel: '5600KV Brushless (~18,5 km/h reali)',
    colorHex: '#3b82f6',
    maxSpeedMs: 5.15, // ~18.5 km/h reali
    accelMs2: 7.8,
    motorBrake: 1.08,
    pitchBase: 390,
    description: 'Prestazioni reali da categoria Kyosho Cup Pro-Stock: veloce sul dritto ma perfettamente dosabile in curva.'
  },
  {
    id: 'xspeed_red_8500',
    name: 'SPEED HOUSE X-Speed 85 PRO (Rosso - 8500KV)',
    kvLabel: '8500KV Extreme (~21,5 km/h reali)',
    colorHex: '#ef4444',
    maxSpeedMs: 5.95, // ~21.4 km/h reali
    accelMs2: 9.4,
    motorBrake: 1.16,
    pitchBase: 470,
    description: 'Motore da categoria Open / Modified! Allungo bruciante sul rettilineo principale.'
  }
];

export const PINIONS = [
  { id: 'pinion_6t', name: 'Pignone 6 Denti (6T - Massima Ripresa)', teeth: 6, speedMult: 0.90, accelMult: 1.14 },
  { id: 'pinion_7t', name: 'Pignone 7 Denti (7T - Equilibrato)', teeth: 7, speedMult: 1.00, accelMult: 1.00 },
  { id: 'pinion_8t', name: 'Pignone 8 Denti (8T - Allungo Veloce)', teeth: 8, speedMult: 1.08, accelMult: 0.93 },
  { id: 'pinion_9t', name: 'Pignone 9 Denti (9T - Velocità Massima)', teeth: 9, speedMult: 1.16, accelMult: 0.86 }
];

export const FRONT_SPRINGS = [
  {
    id: 'spring_red_soft',
    name: 'Molla Rossa (Morbida)',
    colorHex: '#ef4444',
    rollStiffness: 0.78,
    turnInBoost: 1.14,
    gripRollMod: 1.20,
    description: 'Fa piegare di più il muso in ingresso curva aumentando la tenuta anteriore.'
  },
  {
    id: 'spring_yellow_med',
    name: 'Molla Gialla (Media)',
    colorHex: '#eab308',
    rollStiffness: 1.00,
    turnInBoost: 1.00,
    gripRollMod: 1.00,
    description: 'Taratura standard da gara: rollio controllato e risposta sincera nei cambi di direzione.'
  },
  {
    id: 'spring_green_hard',
    name: 'Molla Verde (Dura)',
    colorHex: '#22c55e',
    rollStiffness: 1.28,
    turnInBoost: 0.92,
    gripRollMod: 0.72,
    description: 'Mantiene l\'auto piatta sui cordoli ed evita il cappottamento con gomme molto morbide.'
  }
];

export const T_PLATES = [
  {
    id: 'tplate_soft_1',
    name: 'T-Plate Carbonio #1 (Morbida 0.5mm)',
    rearFlex: 1.18,
    exitTraction: 1.12,
    responsiveness: 0.94,
    description: 'Permette al retrotreno di copiare ogni asperità dando più trazione in uscita dai tornanti.'
  },
  {
    id: 'tplate_med_2',
    name: 'T-Plate Carbonio #2 (Media 0.6mm)',
    rearFlex: 1.00,
    exitTraction: 1.04,
    responsiveness: 1.04,
    description: 'Perfetto equilibrio tra trazione posteriore e rapidità nei cambi di direzione.'
  },
  {
    id: 'tplate_hard_3',
    name: 'T-Plate Carbonio #3 (Rigida 0.8mm)',
    rearFlex: 0.82,
    exitTraction: 0.95,
    responsiveness: 1.16,
    description: 'Rende il retrotreno super reattivo nelle esse veloci.'
  }
];

export const DIFFERENTIALS = [
  {
    id: 'diff_ball',
    name: 'Differenziale a Sfere Regolabile (Ball Diff)',
    rotationEase: 1.10,
    tractionStab: 1.08,
    description: 'Scorrevolezza superiore a centro curva e trazione simmetrica in accelerazione.'
  },
  {
    id: 'diff_gear',
    name: 'Differenziale a Ingranaggi (Gear Diff)',
    rotationEase: 1.00,
    tractionStab: 1.00,
    description: 'Robusto e costante, ottimo per piste tecniche.'
  },
  {
    id: 'diff_spool',
    name: 'Palo Rigido Bloccato (Spool / Drift)',
    rotationEase: 0.85,
    tractionStab: 1.25,
    description: 'Blocca le ruote posteriori insieme per facilitare la derapata continua nel Drift.'
  }
];

export const DEFAULT_CAR_SETUP = {
  bodyId: 'ferrari_499p',
  chassisId: 'mr04_evo2',
  frontTireId: 'front_30_med',
  rearTireId: 'rear_20_radial',
  motorId: 'xspeed_blue_5600',
  pinionId: 'pinion_7t',
  frontSpringId: 'spring_yellow_med',
  tPlateId: 'tplate_med_2',
  diffId: 'diff_ball',
  showNakedChassis: false,
  customBodyColor: '#d40000'
};
