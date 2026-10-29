export class SoundAndCommentary {
  constructor(profileManager, onSubtitleChange) {
    this.profileManager = profileManager;
    this.onSubtitleChange = onSubtitleChange;
    this.ctx = null;
    this.motorOsc1 = null;
    this.motorOsc2 = null;
    this.motorGain = null;
    this.skidGain = null;
    this.isAudioUnlocked = false;
    this.isSpeaking = false;
    this.lastCommentTime = 0;
    this.italianVoice = null;
    this.subtitleTimeout = null;
    this.speechSafetyTimeout = null;
    this.speechEndedAt = 0;
    this.pendingLine = null;
    this.motorActive = true;
    this.lastBarrierHitTime = 0;
    this.lastContactTime = new Map();
    this.availableVoices = [];
    this.onVoicesChanged = null;
    // Un motore per ogni auto in pista (giocatore + avversari), ciascuno con il suo panner 3D
    this.engines = new Map();
    this.masterBus = null;
    this.noiseBuffer = null;

    this.initSpeechSynthesis();
    this.bindUnlock();
    this.bindVisibility();
  }

  // Voce del telecronista: solo voci italiane, scegliendo per prime quelle neurali/naturali. Prima, se il
  // browser non trovava una voce "it", la frase veniva letta da una voce straniera (l'effetto "cinese che
  // parla italiano"); ora in quel caso si lascia scegliere al sistema la sua voce it-IT predefinita.
  static scoreVoice(v) {
    const name = v.name || '';
    let score = 0;
    if (/^it[-_]IT$/i.test(v.lang)) score += 6;
    if (/natural|neural|online/i.test(name)) score += 60; // Edge / Windows 11: Elsa, Isabella, Diego Online (Natural)
    if (/premium|enhanced|migliorat|siri/i.test(name)) score += 45; // macOS / iOS: voci scaricate di qualità alta
    if (/google/i.test(name)) score += 30; // Chrome: Google italiano
    if (/elsa|isabella|diego|giuseppe|federica|alice|luca|paola|emma|cosimo/i.test(name)) score += 8;
    if (/espeak|compact|eloquence|grandma|grandpa|rocko|shelley|flo|reed|sandy/i.test(name)) score -= 40;
    return score;
  }

  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      this.availableVoices = voices
        .filter((v) => /^it([-_]|$)/i.test(v.lang || ''))
        .sort((a, b) => SoundAndCommentary.scoreVoice(b) - SoundAndCommentary.scoreVoice(a));
      const wanted = this.profileManager.state.audio.voiceName;
      this.italianVoice =
        (wanted && this.availableVoices.find((v) => v.name === wanted)) || this.availableVoices[0] || null;
      this.onVoicesChanged?.(this.availableVoices, this.italianVoice);
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    this.refreshVoices = pickVoice;
  }

  setVoiceByName(name) {
    this.profileManager.state.audio.voiceName = name || '';
    this.profileManager.save();
    this.refreshVoices?.();
  }

  bindUnlock() {
    const unlock = () => {
      if (this.isAudioUnlocked) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterBus = this.ctx.createDynamicsCompressor();
        this.masterBus.threshold.value = -14;
        this.masterBus.ratio.value = 4;
        this.masterBus.connect(this.ctx.destination);
        this.setupMotorSynth();
        this.isAudioUnlocked = true;
      } catch (e) {
        // Ignora se non ancora permesso
      }
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  // Con la scheda nascosta requestAnimationFrame si ferma: senza questo il sibilo del motore restava
  // bloccato all'ultimo tono e volume finché non si tornava sul gioco
  bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  // Spegne (o riaccende) motore e fruscio gomme quando l'auto non è guidata: menu gara, replay, fine gara
  setMotorActive(active) {
    this.motorActive = Boolean(active);
    if (!this.ctx || !this.motorGain) return;
    if (!this.motorActive) {
      const now = this.ctx.currentTime;
      this.motorGain.gain.setTargetAtTime(0, now, 0.06);
      this.skidGain?.gain.setTargetAtTime(0, now, 0.06);
      for (const eng of this.engines.values()) eng.gain.gain.setTargetAtTime(0, now, 0.06);
    }
  }

  getNoiseBuffer() {
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  // Panner 3D: il suono arriva dal punto della pista in cui si trova l'auto, ascoltato dalla telecamera
  createPanner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 0.9;
    p.rolloffFactor = 1.1;
    p.maxDistance = 30;
    return p;
  }

  setPannerPosition(panner, pos) {
    if (!panner || !pos) return;
    const t = this.ctx.currentTime;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(pos.x, t, 0.02);
      panner.positionY.setTargetAtTime(pos.y, t, 0.02);
      panner.positionZ.setTargetAtTime(pos.z, t, 0.02);
    } else {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  // Posizione e orientamento dell'ascoltatore = telecamera attiva (palco, inseguimento, replay)
  updateListener(camera) {
    if (!this.ctx || !camera) return;
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(px, t, 0.02);
      l.positionY.setTargetAtTime(py, t, 0.02);
      l.positionZ.setTargetAtTime(pz, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // Motorino 130 a spazzole + cascata pignone/corona: sibilo acuto (dente sega), armonica degli
  // ingranaggi (triangolo) e fruscio delle spazzole (rumore filtrato che segue i giri)
  createEngine(id) {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = 180;
    osc2.frequency.value = 500;
    // Ogni motore ha una leggera stonatura propria: quattro auto insieme non suonano come una sola
    const detune = (Math.random() - 0.5) * 60;
    osc1.detune.value = detune;
    osc2.detune.value = detune;

    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 0.55;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.32;

    const brush = ctx.createBufferSource();
    brush.buffer = this.getNoiseBuffer();
    brush.loop = true;
    brush.playbackRate.value = 0.8 + Math.random() * 0.4;
    const brushFilter = ctx.createBiquadFilter();
    brushFilter.type = 'bandpass';
    brushFilter.frequency.value = 3200;
    brushFilter.Q.value = 0.9;
    const brushGain = ctx.createGain();
    brushGain.gain.value = 0.22;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4200;
    tone.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = this.createPanner();

    osc1.connect(osc1Gain).connect(tone);
    osc2.connect(osc2Gain).connect(tone);
    brush.connect(brushFilter).connect(brushGain).connect(tone);
    tone.connect(gain).connect(panner).connect(this.masterBus || ctx.destination);
    osc1.start();
    osc2.start();
    brush.start();

    const eng = { id, osc1, osc2, brushFilter, brushGain, tone, gain, panner };
    this.engines.set(id, eng);
    return eng;
  }

  setupMotorSynth() {
    if (!this.ctx) return;

    // Motore dell'auto del giocatore (stesso sintetizzatore degli avversari, posizionato nello spazio)
    const player = this.createEngine('player');
    this.motorGain = player.gain;

    // Generatore fruscio gomme su tappeto RCP (rumore bianco filtrato), che parte dall'auto del giocatore
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();
    noise.loop = true;

    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1650;
    skidFilter.Q.value = 3.5;

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;

    noise.connect(skidFilter);
    skidFilter.connect(this.skidGain);
    this.skidGain.connect(player.panner);
    noise.start();
  }

  // speedRatio: velocità / velocità massima del motore (0..1,3), throttle: 0..1
  driveEngine(eng, speedRatio, throttle, basePitch, pos, volumeScale = 1) {
    const audioCfg = this.profileManager.state.audio;
    const baseVol = audioCfg.motorVolume ?? 0.65;
    const absSpeed = Math.min(1.3, Math.abs(speedRatio));
    const freq1 = basePitch * 0.45 + absSpeed * basePitch * 2.4 + throttle * 95;
    const freq2 = freq1 * 2.75; // Armonica pignone

    const now = this.ctx.currentTime;
    eng.osc1.frequency.setTargetAtTime(freq1, now, 0.03);
    eng.osc2.frequency.setTargetAtTime(freq2, now, 0.03);
    eng.brushFilter.frequency.setTargetAtTime(2200 + absSpeed * 3600, now, 0.05);
    eng.brushGain.gain.setTargetAtTime(0.12 + throttle * 0.22, now, 0.05);
    eng.tone.frequency.setTargetAtTime(2600 + absSpeed * 3800 + throttle * 900, now, 0.05);

    const targetGain = (0.05 + absSpeed * 0.2 + throttle * 0.1) * baseVol * volumeScale;
    // Auto ferma e grilletto rilasciato: una Mini-Z vera è muta
    eng.gain.gain.setTargetAtTime(absSpeed < 0.01 && throttle < 0.02 ? 0 : targetGain, now, 0.04);
    this.setPannerPosition(eng.panner, pos);
  }

  updateMotorSound(speedRatio, throttle, slipAmount, motorSpec, pos) {
    if (!this.ctx || !this.motorGain || !this.motorActive) return;
    if (this.ctx.state === 'suspended' && !document.hidden) {
      this.ctx.resume().catch(() => {});
    }
    const player = this.engines.get('player');
    this.driveEngine(player, speedRatio, throttle, motorSpec?.pitchBase || 340, pos);

    if (this.skidGain) {
      const baseVol = this.profileManager.state.audio.motorVolume ?? 0.65;
      const skidTarget = Math.min(0.18, Math.max(0, slipAmount - 0.18) * 0.27) * baseVol;
      this.skidGain.gain.setTargetAtTime(skidTarget, this.ctx.currentTime, 0.05);
    }
  }

  // Motori degli avversari: cars = [{ id, speedRatio, throttle, pos }]
  updateOpponentEngines(cars) {
    if (!this.ctx) return;
    const seen = new Set();
    for (const c of cars) {
      seen.add(c.id);
      const eng = this.engines.get(c.id) || this.createEngine(c.id);
      if (!this.motorActive) {
        eng.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        continue;
      }
      this.driveEngine(eng, c.speedRatio, c.throttle, c.pitchBase || 340, c.pos, 0.9);
    }
    // Avversari tolti (pista libera): il loro motore si spegne
    for (const [id, eng] of this.engines) {
      if (id !== 'player' && !seen.has(id)) eng.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
  }

  // Contatto tra due Mini-Z: "clac" secco delle carrozzerie in policarbonato + colpo sordo del telaio
  playCarContact(intensity, pos, pairKey = 'x') {
    if (!this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - (this.lastContactTime.get(pairKey) || 0) < 110) return;
    this.lastContactTime.set(pairKey, nowMs);

    const k = Math.min(1, Math.max(0.05, intensity));
    const vol = (0.12 + k * 0.55) * (this.profileManager.state.audio.motorVolume ?? 0.65);
    const now = this.ctx.currentTime;
    const panner = this.createPanner();
    this.setPannerPosition(panner, pos);
    panner.connect(this.masterBus || this.ctx.destination);

    // Clac della plastica: raffica di rumore brevissima e brillante
    const click = this.ctx.createBufferSource();
    click.buffer = this.getNoiseBuffer();
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 2400 + Math.random() * 1800;
    clickFilter.Q.value = 2.2;
    const clickGain = this.ctx.createGain();
    const clickDur = 0.035 + k * 0.05;
    clickGain.gain.setValueAtTime(vol, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0008, now + clickDur);
    click.connect(clickFilter).connect(clickGain).connect(panner);
    click.start(now, Math.random() * 1.2);
    click.stop(now + clickDur + 0.02);

    // Tonfo del telaio e delle gomme che si toccano
    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(420 - k * 160, now);
    thump.frequency.exponentialRampToValueAtTime(110, now + 0.07);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(vol * 0.7, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
    thump.connect(thumpGain).connect(panner);
    thump.start(now);
    thump.stop(now + 0.1);

    // Strisciata: se il contatto è lungo e leggero si sente lo sfregamento delle carrozzerie
    if (k < 0.35) {
      const scrape = this.ctx.createBufferSource();
      scrape.buffer = this.getNoiseBuffer();
      const sf = this.ctx.createBiquadFilter();
      sf.type = 'highpass';
      sf.frequency.value = 3800;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(vol * 0.35, now);
      sg.gain.exponentialRampToValueAtTime(0.0008, now + 0.14);
      scrape.connect(sf).connect(sg).connect(panner);
      scrape.start(now, Math.random() * 1.2);
      scrape.stop(now + 0.16);
    }
  }

  // Classico BIP del ponte cronometraggio Kyosho / LapMonitor
  playLapBeep(isBestLap = false) {
    if (!this.ctx) return;
    const vol = (this.profileManager.state.audio.beepVolume ?? 0.85) * 0.16;
    const now = this.ctx.currentTime;

    const beep = (freq, startOffset, duration) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      g.gain.setValueAtTime(vol, now + startOffset);
      g.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    if (isBestLap) {
      beep(2450, 0, 0.11);
      beep(3100, 0.13, 0.18);
    } else {
      beep(2200, 0, 0.14);
    }
  }

  // Semaforo di partenza: tre bip brevi, poi un bip più lungo e più acuto per il verde
  playStartBeep(isGo = false) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const vol = (this.profileManager.state.audio.beepVolume ?? 0.85) * 0.14;
    const now = this.ctx.currentTime;
    const dur = isGo ? 0.45 : 0.16;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(isGo ? 1320 : 880, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.setValueAtTime(vol, now + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // Suono morbido dell'impatto contro le sponde in gomma RCP
  playBarrierHit(intensity = 0.5, pos = null) {
    if (!this.ctx) return;
    // La fisica gira a 2 sotto-passi: strisciando sulla sponda il colpo partiva a raffica ogni fotogramma
    const nowMs = performance.now();
    if (nowMs - this.lastBarrierHitTime < 140) return;
    this.lastBarrierHitTime = nowMs;
    const vol = Math.min(0.25, intensity * 0.18) * (this.profileManager.state.audio.motorVolume ?? 0.65);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    g.gain.setValueAtTime(vol * 2.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    if (pos) {
      const panner = this.createPanner();
      this.setPannerPosition(panner, pos);
      g.connect(panner).connect(this.masterBus || this.ctx.destination);
    } else {
      g.connect(this.ctx.destination);
    }
    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Telecronaca in Tempo Reale (Voce + Sottotitolo Direzione Gara)
  // Ritmo calmo da speaker di club: voce a velocità normale, una frase alla volta (nessuna frase
  // interrotta a metà da un'altra), pausa minima tra una frase e la successiva. Mentre parla, una frase
  // importante resta in attesa (al massimo una); le frasi di colore vengono scartate.
  speak(text, priority = 'normal') {
    const now = performance.now();
    if (priority === 'force') {
      this.pendingLine = null;
      this.startLine(text, true);
      return;
    }

    const isHigh = priority === 'high';
    if (this.isSpeaking) {
      if (isHigh) this.pendingLine = { text, at: now };
      return;
    }

    const gapAfterLast = isHigh ? 700 : priority === 'low' ? 4500 : 2600;
    const minSinceStart = isHigh ? 0 : 6500;
    if (now - this.speechEndedAt < gapAfterLast || now - this.lastCommentTime < minSinceStart) {
      if (isHigh) this.scheduleLine({ text, at: now }, gapAfterLast - (now - this.speechEndedAt));
      return;
    }
    this.startLine(text, false);
  }

  scheduleLine(line, delayMs) {
    this.pendingLine = line;
    setTimeout(() => this.flushPending(), Math.max(50, delayMs));
  }

  flushPending() {
    const line = this.pendingLine;
    if (!line || this.isSpeaking) return;
    this.pendingLine = null;
    // Una frase rimasta in coda troppo a lungo non è più attuale (es. il tempo di un giro di 6 secondi fa)
    if (performance.now() - line.at > 5000) return;
    this.startLine(line.text, false);
  }

  // Durata stimata di una frase a velocità normale (circa 2,6 parole al secondo in italiano)
  estimateDurationMs(text) {
    const words = text.trim().split(/\s+/).length;
    return 900 + (words / 2.6) * 1000;
  }

  startLine(text, interrupt) {
    const lineId = (this.lineId = (this.lineId || 0) + 1);
    this.lastCommentTime = performance.now();
    this.isSpeaking = true;

    if (this.onSubtitleChange) this.onSubtitleChange(text, true);

    const audioCfg = this.profileManager.state.audio;
    const canSpeak = audioCfg.commentaryEnabled && 'speechSynthesis' in window;
    const estimate = this.estimateDurationMs(text);

    const finish = () => {
      // Una frase interrotta da una "force" chiama onerror: non deve chiudere quella nuova
      if (lineId !== this.lineId || !this.isSpeaking) return;
      this.isSpeaking = false;
      this.speechEndedAt = performance.now();
      if (this.speechSafetyTimeout) clearTimeout(this.speechSafetyTimeout);
      if (this.subtitleTimeout) clearTimeout(this.subtitleTimeout);
      // Il sottotitolo resta leggibile un attimo dopo la fine della voce
      this.subtitleTimeout = setTimeout(() => {
        if (!this.isSpeaking && this.onSubtitleChange) this.onSubtitleChange(text, false);
      }, 1200);
      if (this.pendingLine) setTimeout(() => this.flushPending(), 700);
    };

    if (this.speechSafetyTimeout) clearTimeout(this.speechSafetyTimeout);
    // Rete di sicurezza: alcuni browser non chiamano onend (o la voce è spenta): si chiude a tempo stimato
    this.speechSafetyTimeout = setTimeout(finish, canSpeak ? estimate * 1.6 + 2000 : estimate);

    if (!canSpeak) return;

    try {
      if (interrupt || window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = this.italianVoice?.lang || 'it-IT';
      if (this.italianVoice) utter.voice = this.italianVoice;
      // Le voci neurali suonano naturali a velocità 1: rallentarle le rende strascicate e robotiche
      utter.rate = Math.max(0.7, Math.min(1.4, audioCfg.voiceRate ?? 1.0));
      utter.pitch = Math.max(0.7, Math.min(1.3, audioCfg.voicePitch ?? 1.0));
      utter.volume = Math.max(0, Math.min(1, audioCfg.commentaryVolume ?? 0.95));
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // Fallback silenzioso ai soli sottotitoli
    }
  }

  commentLap(lapNumber, lapTimeSec, isRecord, deltaSec) {
    // Arrotonda prima ai centesimi: 6,996 s diventa "7 e 00", non "6 e 100"
    const totalCent = Math.round(lapTimeSec * 100);
    const sec = Math.floor(totalCent / 100);
    const cent = (totalCent % 100).toString().padStart(2, '0');

    // Come lo speaker del cronometraggio di un club: frasi brevi, il tempo prima di tutto.
    // Priorità alta = mai scartate, ma aspettano che la frase in corso finisca.
    if (isRecord) {
      const phrases = [
        `Giro record! ${sec} e ${cent}!`,
        `Nuovo miglior tempo: ${sec} e ${cent}!`,
        `Record della pista abbassato: ${sec} e ${cent}!`
      ];
      this.speak(phrases[lapNumber % phrases.length], 'high');
    } else if (deltaSec !== null && deltaSec < 0.25) {
      this.speak(`Giro ${lapNumber}, ${sec} e ${cent}. Vicino al record!`, 'high');
    } else {
      this.speak(`Giro ${lapNumber}, ${sec} e ${cent}.`, 'high');
    }
  }

  commentWallHit(hard = false) {
    if (hard) {
      const phrases = [
        'Attenzione! Contatto deciso contro le sponde morbide RCP, perde decimi preziosi!',
        'Tocca la barriera esterna in uscita di curva! Per fortuna le sponde RCP assorbono il colpo!',
        'Largo in staccata, appoggia la carrozzeria sulla sponda della pista!'
      ];
      this.speak(phrases[Math.floor(Math.random() * phrases.length)], 'normal');
    }
  }

  commentFlipMarshal() {
    this.speak(
      'Attenzione, cappottamento sul cordolo per troppo grip anteriore! Interviene subito il commissario di pista!',
      'high'
    );
  }

  commentDrift() {
    const phrases = [
      'Che traverso spettacolare! Angolo di derapata perfetto a filo sponde!',
      'Controsterzo da manuale con le quattro ruote motrici!',
      'Passaggio in pieno drift davanti alla Direzione Gara!'
    ];
    this.speak(phrases[Math.floor(Math.random() * phrases.length)], 'normal');
  }

  commentStraightSpeed(carName) {
    this.speak(`${carName} a tutto gas sul rettilineo principale sotto il palco!`, 'normal');
  }
}
