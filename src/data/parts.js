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

export const CAR_CATEGORIES = [
  {
    id: 'hypercar',
    name: 'Hypercar (WEC / LMH / LMDh 1:27)',
    description: 'Prototipi ufficiali Le Mans Hypercar e LMDh in scala 1:27 per telaio Kyosho Mini-Z Passo 98mm LL.'
  },
  {
    id: 'gt3',
    name: 'GT3 (dalla categoria GT3 NSR di Slot-Car)',
    description: 'Le carrozzerie GT3 della categoria NSR di Slot-Car, ognuna sul passo Mini-Z in cui Kyosho monta le GT3 (MR-04 EVO2 W-MM).'
  }
];

export const CAR_BODIES = [
  {
    id: 'ferrari_499p',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Ferrari 499P #51 Rosso Corsa (WEC)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/ferrari_499p.glb',
    paintMaterials: ['Body', 'main'],
    defaultColor: '#d40000',
    aeroBonus: 1.12,
    weightBias: 0.98,
    description: 'Carrozzeria 3D Ferrari 499P Hypercar ufficiale #51 per telaio Mini-Z LM 98mm con ruote 3D indipendenti.'
  },
  {
    id: 'ferrari_499p_af2026',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Ferrari 499P #83 AF Corse (2026)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/ferrari_499p_af2026.glb',
    paintMaterials: ['Geomainbody0281Mtl'],
    defaultColor: '#eab308',
    aeroBonus: 1.12,
    weightBias: 0.98,
    description: 'Carrozzeria 3D Ferrari 499P AF Corse 2026 in livrea Giallo Modena / Rosso con ruote 3D indipendenti.'
  },
  {
    id: 'porsche_963',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Porsche 963 LMDh #5 Penske (2023)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.4,
    widthCm: 7.8,
    heightCm: 4.5,
    glbUrl: '/models/porsche_963.glb',
    paintMaterials: ['PORSCHEPorsche_963LMDh_2023PaintA_Material1', 'PORSCHEPorsche_963LMDh_2023Coloured_Material1'],
    defaultColor: '#f8fafc',
    aeroBonus: 1.13,
    weightBias: 0.99,
    description: 'Prototipo 3D Porsche 963 LMDh #5 ufficiale Penske Motorsport con pinna aerodinamica e ruote 3D indipendenti.'
  },
  {
    id: 'toyota_tr010',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Toyota TR010 Hybrid Gazoo Racing (2026)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.1,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/toyota_tr010.glb',
    paintMaterials: ['PAINT'],
    defaultColor: '#dc2626',
    aeroBonus: 1.12,
    weightBias: 1.0,
    description: 'Prototipo 3D Toyota TR010 Hybrid 2026 ad alto carico aerodinamico per telaio Mini-Z LM 98mm.'
  },
  {
    id: 'bmw_m_hybrid_v8',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'BMW M Hybrid V8 LMDh M Team WRT',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/bmw_m_hybrid_v8.glb',
    paintMaterials: ['Body', 'Body.001', 'main'],
    defaultColor: '#2563eb',
    aeroBonus: 1.11,
    weightBias: 0.99,
    description: 'Prototipo 3D BMW M Hybrid V8 LMDh con doppio rene anteriore e livrea ufficiale M Motorsport.'
  },
  {
    id: 'cadillac_v_series_r',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Cadillac V-Series.R LMDh (2023)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.6,
    glbUrl: '/models/cadillac_v_series_r.glb',
    paintMaterials: ['CARPAINT'],
    defaultColor: '#eab308',
    aeroBonus: 1.11,
    weightBias: 1.0,
    description: 'Prototipo 3D Cadillac V-Series.R LMDh con fari verticali a lama e grande stabilità nei curvoni.'
  },
  {
    id: 'lamborghini_sc63',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Lamborghini SC63 LMDh Squadra Corse (2024)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.5,
    glbUrl: '/models/lamborghini_sc63.glb',
    paintMaterials: ['Lamborghini_SC63LMDH_2024PaintA_Material', 'Lamborghini_SC63LMDH_2024Coloured_Material'],
    defaultColor: '#16a34a',
    aeroBonus: 1.12,
    weightBias: 0.98,
    description: 'Prototipo 3D Lamborghini SC63 LMDh Verde Mantis Squadra Corse con firma luminosa a Y.'
  },
  {
    id: 'alpine_a424',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Alpine A424 LMDh Endurance Team (2024)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.5,
    glbUrl: '/models/alpine_a424.glb',
    paintMaterials: ['mat_44.001'],
    defaultColor: '#0284c7',
    aeroBonus: 1.12,
    weightBias: 0.97,
    description: 'Prototipo 3D Alpine A424 LMDh Blu Alpine metallizzato, agilissimo nei cambi di direzione.'
  },
  {
    id: 'peugeot_9x8',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Peugeot 9X8 Hybrid LMH (2024)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.4,
    glbUrl: '/models/peugeot_9x8.glb',
    paintMaterials: ['x8Vehicle_Exterior_mm_ext1'],
    defaultColor: '#64748b',
    aeroBonus: 1.13,
    weightBias: 0.96,
    description: 'Prototipo 3D Peugeot 9X8 Hybrid LMH a effetto suolo con triplo artiglio LED anteriore.'
  },
  {
    id: 'aston_martin_valkyrie',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Aston Martin Valkyrie AMR-LMH (2026)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.3,
    widthCm: 7.8,
    heightCm: 4.4,
    glbUrl: '/models/aston_martin_valkyrie.glb',
    paintMaterials: ['EXT_CARPAINT'],
    defaultColor: '#0f766e',
    aeroBonus: 1.14,
    weightBias: 0.96,
    description: 'Prototipo 3D Aston Martin Valkyrie AMR-LMH 2026 con tunnel Venturi integrati e baricentro bassissimo.'
  },
  {
    id: 'genesis_gmr001',
    category: 'hypercar',
    categoryName: 'Hypercar',
    name: 'Genesis GMR-001 Hypercar Magma (2026)',
    scaleLabel: 'Hypercar 1:27 • Passo 98mm LL',
    lengthCm: 17.2,
    widthCm: 7.8,
    heightCm: 4.5,
    glbUrl: '/models/genesis_gmr001.glb',
    paintMaterials: ['PAINT', 'BODY_DETAIL'],
    defaultColor: '#ea580c',
    aeroBonus: 1.12,
    weightBias: 0.98,
    description: 'Prototipo 3D Genesis GMR-001 Hypercar 2026 Magma Racing con doppia linea LED parabolica.'
  },
  // GT3: carrozzerie della categoria "GT3 NSR" di unnerdemezzo/Slot-Car (assets/gt3), solo livello di dettaglio vicino,
  // texture WebP 1024. Muso verso +X: MiniZCar le ruota. La scala viene dal passo (wheelbaseMm), non dalla lunghezza:
  // gli assi del modello cadono su quelli del telaio. Kyosho monta le sue GT3 (AMG GT3, R8 LMS, 720S GT3, C8.R,
  // 911 GT3 RS) su MR-04 W-MM; il passo 90/94/98 è scelto dal passo reale di ogni auto.
  {
    id: 'gt3_aston',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Aston Martin Vantage GTE',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/aston.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Aston Martin Vantage GTE: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Vantage reale: passo 2704 mm, nessuna GT3 Kyosho ufficiale: passo lungo del W-MM.'
  },
  {
    id: 'gt3_vantagehor',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Aston Martin Vantage GT3 EVO · Heart of Racing',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/vantagehor.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Aston Martin Vantage GT3 EVO · Heart of Racing: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Stessa scocca Vantage (passo reale 2704 mm): W-MM 94 mm.'
  },
  {
    id: 'gt3_mercedes',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Mercedes-AMG GT3',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mercedes.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Mercedes-AMG GT3: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho la vende come Readyset MR-04 W-MM (passo reale 2630 mm).'
  },
  {
    id: 'gt3_ferrari',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Ferrari 296 GT3',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/ferrari.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Ferrari 296 GT3: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Passo reale 2600 mm, proporzioni da W-MM 94 mm.'
  },
  {
    id: 'gt3_ferrari296vr',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Ferrari 296 GT3 · Verstappen Racing (2025)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/ferrari296vr.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Ferrari 296 GT3 · Verstappen Racing (2025): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Stessa 296 GT3 (passo reale 2600 mm): W-MM 94 mm.'
  },
  {
    id: 'gt3_ferrari296challenge',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Ferrari 296 Challenge (2024)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/ferrari296challenge.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Ferrari 296 Challenge (2024): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Monomarca su base 296 (passo reale 2600 mm): W-MM 94 mm.'
  },
  {
    id: 'gt3_bmw',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'BMW M4 GT3 EVO',
    scaleLabel: 'GT3 • MR-04 EVO2 W-RM · passo 98 mm',
    wheelbaseMm: 98,
    glbUrl: '/models/gt3/bmw.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'BMW M4 GT3 EVO: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-RM · passo 98 mm. La GT3 col passo reale più lungo (2918 mm): serve il pod da 98 mm.'
  },
  {
    id: 'gt3_porsche992',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Porsche 992 GT3 R (2024)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 90 mm',
    wheelbaseMm: 90,
    glbUrl: '/models/gt3/porsche992.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Porsche 992 GT3 R (2024): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 90 mm. Passo reale corto (2507 mm), come la 911 GT3 RS Kyosho su W-MM: posizione da 90 mm.'
  },
  {
    id: 'gt3_porsche992rexy',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Porsche 992 GT3 R · Rexy',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 90 mm',
    wheelbaseMm: 90,
    glbUrl: '/models/gt3/porsche992rexy.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Porsche 992 GT3 R · Rexy: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 90 mm. Stessa 992 GT3 R (passo reale 2507 mm): W-MM 90 mm.'
  },
  {
    id: 'gt3_lexusrcf',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Lexus RC F GT3 (2018)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/lexusrcf.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Lexus RC F GT3 (2018): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Passo reale 2730 mm: W-MM nella posizione lunga.'
  },
  {
    id: 'gt3_corvettec8r',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Corvette C8R GT3 · TF Sport',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/corvettec8r.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Corvette C8R GT3 · TF Sport: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho la vende come Readyset MR-04 W-MM (C8.R, passo reale 2722 mm).'
  },
  {
    id: 'gt3_mclaren720sevo',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'McLaren 720S LMGT3 EVO',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mclaren720sevo.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'McLaren 720S LMGT3 EVO: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho la vende come Readyset MR-04 (720S GT3, passo reale 2670 mm).'
  },
  {
    id: 'gt3_mclaren720s2020',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'McLaren 720S GT3 (2020)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mclaren720s2020.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'McLaren 720S GT3 (2020): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho la vende come Readyset MR-04 (720S GT3, passo reale 2670 mm).'
  },
  {
    id: 'gt3_mclareninception',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'McLaren 720S GT3 · Inception Racing',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mclareninception.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'McLaren 720S GT3 · Inception Racing: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho la vende come Readyset MR-04 (720S GT3, passo reale 2670 mm).'
  },
  {
    id: 'gt3_audir8evo2020',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Audi R8 LMS Evo (2020)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/audir8evo2020.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Audi R8 LMS Evo (2020): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho vende la R8 LMS come Readyset MR-04 W-MM (passo reale 2650 mm).'
  },
  {
    id: 'gt3_audir8lms',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Audi R8 LMS',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/audir8lms.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Audi R8 LMS: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Kyosho vende la R8 LMS come Readyset MR-04 W-MM (passo reale 2650 mm).'
  },
  {
    id: 'gt3_mustanggt3ford',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Ford Mustang GT3 · Ford Performance',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mustanggt3ford.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Ford Mustang GT3 · Ford Performance: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Passo reale circa 2740 mm, nessuna Kyosho ufficiale: W-MM nella posizione lunga.'
  },
  {
    id: 'gt3_mustanggt32024',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Ford Mustang GT3 (2024)',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/mustanggt32024.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Ford Mustang GT3 (2024): modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Passo reale circa 2740 mm, nessuna Kyosho ufficiale: W-MM nella posizione lunga.'
  },
  {
    id: 'gt3_temerariogt3',
    category: 'gt3',
    categoryName: 'GT3',
    name: 'Lamborghini Temerario GT3',
    scaleLabel: 'GT3 • MR-04 EVO2 W-MM · passo 94 mm',
    wheelbaseMm: 94,
    glbUrl: '/models/gt3/temerariogt3.glb',
    aeroBonus: 1.04,
    weightBias: 1.0,
    description: 'Lamborghini Temerario GT3: modello 3D e livrea della categoria GT3 NSR di Slot-Car. Telaio MR-04 EVO2 W-MM · passo 94 mm. Passo reale circa 2660 mm, come la Huracán GT3: W-MM 94 mm.'
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
