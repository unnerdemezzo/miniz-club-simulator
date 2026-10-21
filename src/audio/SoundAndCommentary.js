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

    this.initSpeechSynthesis();
    this.bindUnlock();
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
    if (!this.ctx || !this.motorGain) return;
    if (this.ctx.state === 'suspended') {
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
    this.motorGain.gain.setTargetAtTime(absSpeed < 0.01 && throttle < 0.02 ? 0.002 : targetGain, now, 0.04);

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

  // Suono morbido dell'impatto contro le sponde in gomma RCP
  playBarrierHit(intensity = 0.5) {
    if (!this.ctx) return;
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
  speak(text, priority = 'normal') {
    const now = performance.now();
    const minGap = priority === 'high' ? 1800 : 5200;
    if (priority !== 'force' && now - this.lastCommentTime < minGap) return;

    this.lastCommentTime = now;
    this.isSpeaking = true;

    if (this.onSubtitleChange) {
      this.onSubtitleChange(text, true);
    }
    if (this.subtitleTimeout) clearTimeout(this.subtitleTimeout);
    this.subtitleTimeout = setTimeout(() => {
      this.isSpeaking = false;
      if (this.onSubtitleChange) this.onSubtitleChange(text, false);
    }, 4800);

    const audioCfg = this.profileManager.state.audio;
    if (!audioCfg.commentaryEnabled || !('speechSynthesis' in window)) return;

    try {
      if (priority === 'high' || priority === 'force') {
        window.speechSynthesis.cancel();
      } else if (window.speechSynthesis.speaking) {
        return;
      }

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'it-IT';
      if (this.italianVoice) utter.voice = this.italianVoice;
      utter.rate = 1.12; // Ritmo vivace da vero speaker di gara RC!
      utter.pitch = 1.04;
      utter.volume = Math.max(0, Math.min(1, audioCfg.commentaryVolume ?? 0.95));
      utter.onend = () => {
        this.isSpeaking = false;
      };
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // Fallback silenzioso ai soli sottotitoli
    }
  }

  commentLap(lapNumber, lapTimeSec, isRecord, deltaSec) {
    const sec = Math.floor(lapTimeSec);
    const cent = Math.round((lapTimeSec - sec) * 100)
      .toString()
      .padStart(2, '0');

    if (isRecord) {
      const phrases = [
        `Giro record! ${sec} secondi e ${cent} centesimi! Che passaggio sotto al palco!`,
        `Nuovo miglior tempo della pista! ${sec} e ${cent}, guida chirurgica tra i cordoli!`,
        `Strepitoso! Abbassa il record a ${sec} secondi e ${cent}! Il pubblico ai box applaude!`
      ];
      this.speak(phrases[lapNumber % phrases.length], 'high');
    } else if (deltaSec !== null && deltaSec < 0.25) {
      this.speak(`Ottimo giro ${lapNumber}: ${sec} secondi e ${cent}, vicinissimo al tuo record!`, 'normal');
    } else {
      this.speak(`Giro ${lapNumber} concluso in ${sec} secondi e ${cent} centesimi.`, 'normal');
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
