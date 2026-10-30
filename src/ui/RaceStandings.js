// Classifica di gara in tempo reale (HUD in alto a sinistra, stile grafica TV):
// posizione, numero e pilota, distacco dal primo in secondi (o giri), giri completati.
// L'ordine viene dalla distanza percorsa lungo la pista, accumulata fotogramma per fotogramma
// dal parametro t della linea ideale, partendo dalla griglia dietro la linea del ponte.

const MARKS_PER_LAP = 40; // rilevamenti per giro usati per i distacchi in secondi
const DOM_INTERVAL = 0.2; // aggiornamento della tabella (s): leggibile e leggero

// Numero leggibile su qualsiasi livrea: testo scuro sui colori chiari
const numTextColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const lum = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  return lum > 150 ? '#0f172a' : '#ffffff';
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class RaceStandings {
  constructor(listEl) {
    this.listEl = listEl;
    this.cars = new Map();
    this.domTimer = 0;
  }

  // entries: [{ id, name, num, color, body, isPlayer, t }], t = posizione in griglia lungo la pista
  reset(entries, lineT) {
    this.lineT = lineT ?? 0;
    this.cars.clear();
    for (const e of entries) {
      const frac = (((e.t - this.lineT) % 1) + 1) % 1;
      // In griglia si è dietro la linea: il primo passaggio porta a 0 giri completati
      const progress = frac > 0.5 ? frac - 1 : frac;
      this.cars.set(e.id, { ...e, lastT: e.t, progress, marks: new Map(), prevPos: null, gainedUntil: 0, lostUntil: 0 });
    }
    this.domTimer = DOM_INTERVAL;
  }

  // updates: [{ id, t, laps, hidden }] — laps = giri completati ufficiali (cronometro IC-Tag)
  update(dt, nowSec, updates) {
    for (const u of updates) {
      const c = this.cars.get(u.id);
      if (!c) continue;
      let d = u.t - c.lastT;
      if (d > 0.5) d -= 1;
      else if (d < -0.5) d += 1;
      c.lastT = u.t;
      c.progress += d;
      c.laps = u.laps;
      c.hidden = !!u.hidden;
      const k = Math.floor(c.progress * MARKS_PER_LAP);
      if (!c.marks.has(k)) c.marks.set(k, nowSec);
    }

    this.domTimer += dt;
    if (this.domTimer < DOM_INTERVAL) return;
    this.domTimer = 0;
    this.render(nowSec);
  }

  ordered() {
    return [...this.cars.values()].filter((c) => !c.hidden).sort((a, b) => b.progress - a.progress);
  }

  gapText(car, leader) {
    if (car === leader) return 'LEADER';
    const lapsBehind = Math.floor(leader.progress - car.progress);
    if (lapsBehind >= 1) return `+${lapsBehind} ${lapsBehind === 1 ? 'GIRO' : 'GIRI'}`;
    const k = Math.floor(car.progress * MARKS_PER_LAP);
    const tc = car.marks.get(k);
    const tl = leader.marks.get(k);
    if (tc === undefined || tl === undefined) return '—';
    return `+${Math.max(0, tc - tl).toFixed(1)}`;
  }

  render(nowSec) {
    if (!this.listEl) return;
    const rows = this.ordered();
    const leader = rows[0];
    this.listEl.innerHTML = rows
      .map((c, i) => {
        const pos = i + 1;
        if (c.prevPos !== null && pos < c.prevPos) c.gainedUntil = nowSec + 2.5;
        if (c.prevPos !== null && pos > c.prevPos) c.lostUntil = nowSec + 2.5;
        c.prevPos = pos;
        const trend = c.gainedUntil > nowSec ? ' gained' : c.lostUntil > nowSec ? ' lost' : '';
        return (
          `<li class="standings-row${c.isPlayer ? ' is-player' : ''}${trend}" title="${esc(c.body || '')}">` +
          `<span class="st-pos">${pos}</span>` +
          `<span class="st-num" style="--car-col:${esc(c.color)};--car-txt:${numTextColor(c.color)}">${esc(c.num)}</span>` +
          `<span class="st-name">${esc(c.name)}</span>` +
          `<span class="st-gap">${this.gapText(c, leader)}</span>` +
          `<span class="st-laps">${Math.max(0, c.laps ?? 0)}</span>` +
          `</li>`
        );
      })
      .join('');
  }
}
