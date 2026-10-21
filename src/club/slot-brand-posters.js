import * as T from 'three';
import { FLOOR, ROOM } from './config.js';
import { MAX_ANISO } from './util.js';

export const SLOT_BRAND_POSTERS = [
  { id: 'nsr', name: 'KYOSHO MINI-Z', position: [-2.6, FLOOR + 2.55, ROOM.z0 + 0.026], angle: 0 },
  { id: 'slotit', name: 'PN RACING', position: [4.5, FLOOR + 2.55, ROOM.z0 + 0.026], angle: 0 },
  { id: 'scaleauto', name: 'RCP TRACK', position: [ROOM.x1 - 0.026, FLOOR + 2.42, -4.2], angle: -Math.PI / 2 },
  { id: 'polistil', name: 'ATOMIC RC', position: [ROOM.x1 - 0.026, FLOOR + 2.42, -6.6], angle: -Math.PI / 2 },
];
export const WOOD_SLOT_BRAND_POSTERS = SLOT_BRAND_POSTERS;

const BRAND_SPECS = {
  'nsr': { title: 'KYOSHO', sub: 'MINI-Z RACING SERIES · 1:27', bg: '#c8141b', fg: '#ffffff', accent: '#ffd400' },
  'ninco': { title: 'KYOSHO MINI-Z', sub: 'OFFICIAL RCP TRACK SYSTEM', bg: '#111318', fg: '#ffffff', accent: '#e4242b' },
  'slotit': { title: 'PN RACING', sub: 'WORLD PRO MINI-Z COMPONENTS', bg: '#10306e', fg: '#ffffff', accent: '#ff8a00' },
  'slotit-user': { title: 'PN RACING', sub: 'OFFICIAL CLUB PARTNER', bg: '#10306e', fg: '#ffffff', accent: '#ffd400' },
  'scaleauto': { title: 'RCP TRACK', sub: 'HIGH GRIP URETHANE CIRCUIT', bg: '#171a21', fg: '#ffffff', accent: '#19a954' },
  'scaleauto-horizontal': { title: 'KYOSHO RCP', sub: 'MINI-Z CUP OFFICIAL TRACK', bg: '#14161b', fg: '#ffffff', accent: '#e4242b' },
  'polistil': { title: 'ATOMIC RC', sub: 'PRECISION CARBON CHASSIS', bg: '#1f2430', fg: '#ffd400', accent: '#ffffff' },
  'policar': { title: 'MINI-Z CUP', sub: 'ITALIAN CHAMPIONSHIP', bg: '#c8141b', fg: '#ffffff', accent: '#ffd400' },
  'policar-user': { title: 'MINI-Z CLUB', sub: 'OFFICIAL TIMING SYSTEM', bg: '#1b2230', fg: '#ffffff', accent: '#38bdf8' },
  'oxigen-user': { title: 'IC-TAG LIVE', sub: 'LAP TELEMETRY 2.4GHz', bg: '#0f5f36', fg: '#ffffff', accent: '#ffd400' },
  'carrera': { title: 'KYOSHO CUP', sub: 'RWD · AWD · LM HYPERCAR', bg: '#c91924', fg: '#ffffff', accent: '#ffd400' }
};

const cache = new Map();

export function posterTexture(_loader, id = 'nsr') {
  if (cache.has(id)) return cache.get(id);
  const spec = BRAND_SPECS[id] || BRAND_SPECS.nsr;
  const p = Promise.resolve().then(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = spec.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = spec.accent;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(140, 0);
    g.lineTo(90, c.height);
    g.lineTo(0, c.height);
    g.fill();
    g.fillStyle = spec.fg;
    g.font = 'italic 900 112px "Titillium Web", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(spec.title, 540, 155);
    g.fillStyle = spec.accent;
    g.font = '800 36px "Titillium Web", Arial, sans-serif';
    g.fillText(spec.sub, 540, 275);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = MAX_ANISO;
    map.needsUpdate = true;
    return map;
  });
  cache.set(id, p);
  return p;
}

export function buildSlotBrandPosters(scene, loader, posters = SLOT_BRAND_POSTERS) {
  const root = new T.Group();
  root.name = 'Cartelloni aziende Mini-Z';
  scene.add(root);
  const frameMaterial = new T.MeshStandardMaterial({ color: 0x333c42, metalness: 0.55, roughness: 0.4 });
  const ready = posters.map(brand => {
    const g = new T.Group();
    g.name = `Cartellone ${brand.name}`;
    g.position.set(...brand.position);
    g.rotation.y = brand.angle;
    root.add(g);
    const frame = new T.Mesh(new T.BoxGeometry(1.74, 0.70, 0.032), frameMaterial);
    g.add(frame);
    const sheet = new T.Mesh(
      new T.PlaneGeometry(1.68, 0.64),
      new T.MeshStandardMaterial({ color: 0xf5f4ee, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    );
    sheet.position.z = 0.031;
    g.add(sheet);
    return posterTexture(loader, brand.id).then(map => {
      const ratio = map.image.width / map.image.height, w = Math.min(1.56, 0.56 * ratio), h = w / ratio;
      const logo = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({ map, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      );
      logo.position.z = 0.042;
      g.add(logo);
      return true;
    });
  });
  root.userData.ready = Promise.all(ready);
  return root;
}
