// Parametri generali e dimensioni della sala del Mini-Z RC Club (in metri)
import { APP_VERSION } from '../version.js';

export const VERSION = APP_VERSION;

// Colori delle 4 frequenze/canali dei piloti
export const LANES = [
  { d: -0.165, name: 'Rossa',  css: '#e4242b', hex: '#e4242b', col: 0xe4242b, dark: '#7a1014' },
  { d: -0.055, name: 'Bianca', css: '#f4f4f6', hex: '#f4f4f6', col: 0xf4f4f6, dark: '#6a6e78' },
  { d:  0.055, name: 'Verde',  css: '#19a954', hex: '#19a954', col: 0x19a954, dark: '#0d542a' },
  { d:  0.165, name: 'Blu',    css: '#1f7ae8', hex: '#1f7ae8', col: 0x1f7ae8, dark: '#0f3d78' },
];

export const DRIVERS = [
  { name: 'Tu',       num: 51, style: 'mid',   base: '#d9161d', acc: '#ffd400', acc2: '#ffffff', sponsor: 'FERRARI AF CORSE', sponsor2: 'KYOSHO',  sponsorCol: '#ffffff', textCol: '#ffd400', drvName: 'PILOTA',   rim: '#d8dde4', isPlayer: true },
  { name: 'Marco R.', num: 12, style: 'front', base: '#f5f6f8', acc: '#1854c8', acc2: '#e41e26', sponsor: 'PN RACING',        sponsor2: 'ATOMIC',  sponsorCol: '#1854c8', textCol: '#111111', drvName: 'M. ROSSI', rim: '#cfd4dc', pace: 0.995 },
  { name: 'Sara B.',  num: 27, style: 'mid',   base: '#118243', acc: '#ffd21f', acc2: '#ffffff', sponsor: 'M-POWER',          sponsor2: 'SYNCRO',  sponsorCol: '#ffd21f', textCol: '#ffffff', drvName: 'S. BRUNI', rim: '#e4b722', pace: 1.012 },
  { name: 'Luca P.',  num: 46, style: 'back',  base: '#1658c9', acc: '#ff7a00', acc2: '#ffffff', sponsor: 'GL RACING',        sponsor2: 'X-SPEED', sponsorCol: '#ffffff', textCol: '#ffd400', drvName: 'L. POLI',  rim: '#d8dde4', pace: 0.978 },
];

export const FLOOR = -0.85;                                                     // pavimento a -85 cm sotto il piano pista
export const BOARD = { x0: -2.8, x1: 7.7, z0: -5.0, z1: 1.15 };                 // tavolo della pista (10.5 x 6.15 m)
export const ROOM  = { x0: -5.6, x1: 10.6, z0: -8.2, z1: 4.6, h: 3.3 };         // sala del club (16.2 x 12.8 m, soffitto 3.3 m)
export const ROST  = { x0: 0.3, x1: 6.4, z0: 1.55, z1: 2.35, top: -0.40 };      // pedana piloti rialzata di 45 cm

export const TRACK_Y = -0.22; // piano pista abbassato di 22 cm: tavolo a 63 cm dal pavimento, ben sotto lo sguardo dei piloti
