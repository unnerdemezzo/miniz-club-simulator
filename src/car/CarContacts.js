// Contatti fisici tra le Mini-Z in pista (giocatore e avversari).
// Ogni auto è una capsula vista dall'alto: un segmento lungo l'asse dell'auto con un raggio pari a metà
// carreggiata, così il muso tocca il posteriore di chi precede e le fiancate si appoggiano tra loro.
// Le masse sono uguali (Mini-Z con 4 pile AAA, circa 175 g): l'urto è in parte anelastico (carrozzerie in
// policarbonato e paraurti in gomma) con attrito tra le carrozzerie.

const RESTITUTION = 0.28;
const BODY_FRICTION = 0.32;
// Momento d'inerzia diviso la massa di un parallelepipedo 17,2 x 8 cm (≈ 0,0029 m²), maggiorato perché
// le gomme a terra si oppongono alla rotazione
const INERTIA_PER_MASS = 0.011;

function closestOnSegments(a, b) {
  // Segmento 1: a.p0 + s*d1, segmento 2: b.p0 + t*d2 (punti più vicini fra due segmenti 2D)
  const d1x = a.x1 - a.x0, d1z = a.z1 - a.z0;
  const d2x = b.x1 - b.x0, d2z = b.z1 - b.z0;
  const rx = a.x0 - b.x0, rz = a.z0 - b.z0;
  const aa = d1x * d1x + d1z * d1z;
  const ee = d2x * d2x + d2z * d2z;
  const ff = d2x * rx + d2z * rz;
  const cc = d1x * rx + d1z * rz;
  const bb = d1x * d2x + d1z * d2z;
  const denom = aa * ee - bb * bb;
  let s = denom > 1e-9 ? Math.min(1, Math.max(0, (bb * ff - cc * ee) / denom)) : 0;
  let t = (bb * s + ff) / ee;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -cc / aa));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (bb - cc) / aa));
  }
  return {
    ax: a.x0 + d1x * s,
    az: a.z0 + d1z * s,
    bx: b.x0 + d2x * t,
    bz: b.z0 + d2z * t
  };
}

function segmentOf(body) {
  return {
    x0: body.x - body.fx * body.halfSeg,
    z0: body.z - body.fz * body.halfSeg,
    x1: body.x + body.fx * body.halfSeg,
    z1: body.z + body.fz * body.halfSeg
  };
}

// bodies: [{ id, x, z, fx, fz, vx, vz, halfSeg, radius, push(dx, dz), impulse(jx, jz, px, pz) }]
// Restituisce i contatti avvenuti in questo fotogramma: [{ a, b, x, z, speed }]
export function resolveCarContacts(bodies) {
  const contacts = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let k = i + 1; k < bodies.length; k++) {
      const A = bodies[i];
      const B = bodies[k];
      const reach = A.halfSeg + B.halfSeg + A.radius + B.radius;
      if (Math.abs(A.x - B.x) > reach || Math.abs(A.z - B.z) > reach) continue;

      const c = closestOnSegments(segmentOf(A), segmentOf(B));
      let nx = c.ax - c.bx;
      let nz = c.az - c.bz;
      const dist = Math.hypot(nx, nz);
      const minDist = A.radius + B.radius;
      if (dist >= minDist) continue;
      if (dist > 1e-6) {
        nx /= dist;
        nz /= dist;
      } else {
        nx = A.x - B.x;
        nz = A.z - B.z;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l;
        nz /= l;
      }

      // 1. Separazione: le auto non si compenetrano mai
      const pen = minDist - dist;
      A.push(nx * pen * 0.5, nz * pen * 0.5);
      B.push(-nx * pen * 0.5, -nz * pen * 0.5);

      // Punto di contatto (a metà fra le due superfici)
      const px = (c.ax - nx * A.radius + c.bx + nx * B.radius) * 0.5;
      const pz = (c.az - nz * A.radius + c.bz + nz * B.radius) * 0.5;

      // 2. Impulso: solo se le auto si stanno avvicinando
      const rvx = A.vx - B.vx;
      const rvz = A.vz - B.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn >= 0) continue;

      const jn = (-(1 + RESTITUTION) * vn) / 2;
      // Attrito tra le carrozzerie lungo la superficie di contatto
      const tx = -nz;
      const tz = nx;
      const vt = rvx * tx + rvz * tz;
      const jt = Math.max(-BODY_FRICTION * jn, Math.min(BODY_FRICTION * jn, -vt / 2));
      const jx = nx * jn + tx * jt;
      const jz = nz * jn + tz * jt;

      A.impulse(jx, jz, px, pz);
      B.impulse(-jx, -jz, px, pz);
      contacts.push({ a: A.id, b: B.id, x: px, z: pz, speed: -vn });
    }
  }
  return contacts;
}

// Variazione di velocità angolare (rad/s, positiva = come heading crescente) per un impulso applicato
// nel punto (px, pz) di un'auto con centro (cx, cz)
export function yawFromImpulse(cx, cz, jx, jz, px, pz) {
  const rx = px - cx;
  const rz = pz - cz;
  return (rz * jx - rx * jz) / INERTIA_PER_MASS;
}
