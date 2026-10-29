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

    this.initSpeechSynthesis();
    this.bindUnlock();
    this.bindVisibility();
  }

  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      this.italianVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('it') && /google|microsoft|elsa|cosimo|luca/i.test(v.name)) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('it')) ||
        null;
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  bindUnlock() {
    const unlock = () => {
      if (this.isAudioUnlocked) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
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
    }
  }

  setupMotorSynth() {
    if (!this.ctx) return;

    // Doppio oscillatore per riprodurre il tipico sibilo acuto del motorino Mini-Z + cascata ingranaggi pignone/corona
    this.motorOsc1 = this.ctx.createOscillator();
    this.motorOsc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    this.motorGain = this.ctx.createGain();

    this.motorOsc1.type = 'sawtooth';
    this.motorOsc2.type = 'triangle';
    this.motorOsc1.frequency.value = 180;
    this.motorOsc2.frequency.value = 540;

    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.8;

    this.motorGain.gain.value = 0.0;

    this.motorOsc1.connect(filter);
    this.motorOsc2.connect(filter);
    filter.connect(this.motorGain);
    this.motorGain.connect(this.ctx.destination);

    this.motorOsc1.start();
    this.motorOsc2.start();

    // Generatore fruscio gomme su tappeto RCP (rumore bianco filtrato)
    const bufferSize = this.ctx.sampleRate * 1.5;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1650;
    skidFilter.Q.value = 3.5;

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;

    noise.connect(skidFilter);
    skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.ctx.destination);
    noise.start();
  }

  updateMotorSound(speedRatio, throttle, slipAmount, motorSpec) {
    if (!this.ctx || !this.motorGain || !this.motorActive) return;
    if (this.ctx.state === 'suspended' && !document.hidden) {
      this.ctx.resume().catch(() => {});
    }

    const audioCfg = this.profileManager.state.audio;
    const baseVol = audioCfg.motorVolume ?? 0.65;
    const basePitch = motorSpec?.pitchBase || 340;

    const absSpeed = Math.min(1.3, Math.abs(speedRatio));
    const freq1 = basePitch * 0.45 + absSpeed * basePitch * 2.4 + throttle * 95;
    const freq2 = freq1 * 2.75; // Armonica pignone

    const now = this.ctx.currentTime;
    this.motorOsc1.frequency.setTargetAtTime(freq1, now, 0.03);
    this.motorOsc2.frequency.setTargetAtTime(freq2, now, 0.03);

    const targetGain = (0.012 + absSpeed * 0.065 + throttle * 0.035) * baseVol;
    // Auto ferma e grilletto rilasciato: una Mini-Z vera è muta (prima restava un fischio continuo a -54 dB)
    this.motorGain.gain.setTargetAtTime(absSpeed < 0.01 && throttle < 0.02 ? 0 : targetGain, now, 0.04);

    if (this.skidGain) {
      const skidTarget = Math.min(0.06, Math.max(0, slipAmount - 0.18) * 0.09) * baseVol;
      this.skidGain.gain.setTargetAtTime(skidTarget, now, 0.05);
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
  playBarrierHit(intensity = 0.5) {
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
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(this.ctx.destination);
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
      utter.lang = 'it-IT';
      if (this.italianVoice) utter.voice = this.italianVoice;
      utter.rate = 0.92; // Prima 1,12: troppo veloce e difficile da seguire mentre si guida
      utter.pitch = 1.0;
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
