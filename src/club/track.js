// Tracciato espositivo per il pannello a parete della sala
const samplePts = [];
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2;
  samplePts.push({
    x: Math.cos(a) * 4.2 + Math.sin(a * 2) * 0.9,
    y: Math.sin(a) * 2.2 + Math.cos(a * 3) * 0.45
  });
}

export const TRACK_GEOMETRIES = {
  wood: {
    lanes: [-0.15, -0.05, 0.05, 0.15].map(offset => ({
      pts: samplePts.map(p => ({ x: p.x + offset, y: p.y + offset }))
    }))
  }
};
