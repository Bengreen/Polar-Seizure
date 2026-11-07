/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Audio API synthesizer for loud medical emergency alarm sirens and warning chimes.
 * Generates piercing multi-oscillator sirens with dynamic compression for maximum acoustic penetration.
 * No external MP3 files needed; works reliably offline and in low-memory environments.
 */

export type SirenProfile = 'WAIL' | 'HILO' | 'STROBE';

class AudioAlarmService {
  private audioCtx: AudioContext | null = null;
  private isAlarmActive: boolean = false;
  private primaryOsc: OscillatorNode | null = null;
  private harmonicOsc: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private intervalTimer: number | null = null;
  private onStateChangeCallbacks: ((isPlaying: boolean) => void)[] = [];

  constructor() {
    this.setupGlobalUnlock();
  }

  /**
   * Prime and unlock AudioContext on first user interaction to bypass mobile browser autoplay blocks
   */
  private setupGlobalUnlock() {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      this.initContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      // Play a 1ms inaudible buffer to fully engage audio pipeline on mobile
      try {
        if (this.audioCtx) {
          const buffer = this.audioCtx.createBuffer(1, 1, 22050);
          const source = this.audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioCtx.destination);
          source.start(0);
        }
      } catch {
        // Ignore
      }

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public initContext() {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public onStateChange(cb: (isPlaying: boolean) => void) {
    this.onStateChangeCallbacks.push(cb);
    return () => {
      this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private notifyStateChange(isPlaying: boolean) {
    this.isAlarmActive = isPlaying;
    this.onStateChangeCallbacks.forEach((cb) => cb(isPlaying));
  }

  /**
   * Start high-priority medical emergency siren designed to draw immediate attention.
   * Uses multi-oscillator synthesis and audio compression for maximum acoustic projection.
   *
   * @param volume 0.0 to 1.0 (default 1.0 for emergency alerts)
   * @param profile 'WAIL' | 'HILO' | 'STROBE'
   */
  startSeizureSiren(volume: number = 1.0, profile: SirenProfile = 'WAIL') {
    this.stop(); // Stop any active sounds first
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;

      // 1. Dynamics Compressor for maximum acoustic punch without clipping
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, now);
      this.compressor.knee.setValueAtTime(6, now);
      this.compressor.ratio.setValueAtTime(12, now);
      this.compressor.attack.setValueAtTime(0.003, now);
      this.compressor.release.setValueAtTime(0.15, now);

      // 2. Master Gain (Capped safely at 1.0, default 1.0 for loud attention)
      this.masterGain = this.audioCtx.createGain();
      const safeVol = Math.max(0.1, Math.min(1.0, volume));
      this.masterGain.gain.setValueAtTime(safeVol, now);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.audioCtx.destination);

      if (profile === 'WAIL') {
        this.buildEmergencyWail(now);
      } else if (profile === 'HILO') {
        this.buildHiLoRescue(now);
      } else if (profile === 'STROBE') {
        this.buildStrobeAlarm(now);
      } else {
        this.buildEmergencyWail(now);
      }

      this.notifyStateChange(true);
    } catch (e) {
      console.warn('Audio alarm could not play:', e);
    }
  }

  /**
   * Sound Profile 1: Multi-harmonic Emergency Wail (850Hz to 1450Hz piercing sweep)
   */
  private buildEmergencyWail(now: number) {
    if (!this.audioCtx || !this.masterGain) return;

    // Primary Oscillator: Sawtooth wave for harsh, piercing room-filling cut
    this.primaryOsc = this.audioCtx.createOscillator();
    this.primaryOsc.type = 'sawtooth';
    this.primaryOsc.frequency.setValueAtTime(950, now);

    // Harmonic Oscillator: Square wave at 1.5x (perfect fifth overtone) for acoustic density
    this.harmonicOsc = this.audioCtx.createOscillator();
    this.harmonicOsc.type = 'square';
    this.harmonicOsc.frequency.setValueAtTime(950 * 1.5, now);

    // LFO (Low-Frequency Oscillator): Modulates pitch 3 times per second
    this.lfoOsc = this.audioCtx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(3.2, now); // 3.2 sweeps per second

    const lfoGain1 = this.audioCtx.createGain();
    lfoGain1.gain.setValueAtTime(450, now); // ±450 Hz sweep range

    const lfoGain2 = this.audioCtx.createGain();
    lfoGain2.gain.setValueAtTime(675, now); // ±675 Hz sweep range for harmonic

    this.lfoOsc.connect(lfoGain1);
    lfoGain1.connect(this.primaryOsc.frequency);

    this.lfoOsc.connect(lfoGain2);
    lfoGain2.connect(this.harmonicOsc.frequency);

    // Mix to master
    const primaryGain = this.audioCtx.createGain();
    primaryGain.gain.setValueAtTime(0.75, now);
    this.primaryOsc.connect(primaryGain);
    primaryGain.connect(this.masterGain);

    const harmonicGain = this.audioCtx.createGain();
    harmonicGain.gain.setValueAtTime(0.45, now);
    this.harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(this.masterGain);

    this.primaryOsc.start(now);
    this.harmonicOsc.start(now);
    this.lfoOsc.start(now);
  }

  /**
   * Sound Profile 2: Two-Tone Hi-Lo Rescue Ambulance Siren (Alternating 960Hz / 770Hz)
   */
  private buildHiLoRescue(now: number) {
    if (!this.audioCtx || !this.masterGain) return;

    this.primaryOsc = this.audioCtx.createOscillator();
    this.primaryOsc.type = 'sawtooth';
    this.primaryOsc.frequency.setValueAtTime(960, now);

    this.harmonicOsc = this.audioCtx.createOscillator();
    this.harmonicOsc.type = 'square';
    this.harmonicOsc.frequency.setValueAtTime(960 * 2, now); // Octave overtone

    // Hi-Lo modulation via square-wave LFO (1.8 Hz alternating cadence)
    this.lfoOsc = this.audioCtx.createOscillator();
    this.lfoOsc.type = 'square';
    this.lfoOsc.frequency.setValueAtTime(1.8, now);

    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(190, now); // Shifts between 960Hz and 770Hz

    this.lfoOsc.connect(lfoGain);
    lfoGain.connect(this.primaryOsc.frequency);
    lfoGain.connect(this.harmonicOsc.frequency);

    const primaryGain = this.audioCtx.createGain();
    primaryGain.gain.setValueAtTime(0.7, now);
    this.primaryOsc.connect(primaryGain);
    primaryGain.connect(this.masterGain);

    const harmonicGain = this.audioCtx.createGain();
    harmonicGain.gain.setValueAtTime(0.35, now);
    this.harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(this.masterGain);

    this.primaryOsc.start(now);
    this.harmonicOsc.start(now);
    this.lfoOsc.start(now);
  }

  /**
   * Sound Profile 3: High-Intensity Strobe Alarm (Rapid 4.5 Hz pulses)
   */
  private buildStrobeAlarm(now: number) {
    if (!this.audioCtx || !this.masterGain) return;

    this.primaryOsc = this.audioCtx.createOscillator();
    this.primaryOsc.type = 'sawtooth';
    this.primaryOsc.frequency.setValueAtTime(1150, now);

    this.harmonicOsc = this.audioCtx.createOscillator();
    this.harmonicOsc.type = 'triangle';
    this.harmonicOsc.frequency.setValueAtTime(1800, now);

    // Modulate amplitude rapidly (pulsing strobe volume)
    const tremolo = this.audioCtx.createOscillator();
    tremolo.type = 'square';
    tremolo.frequency.setValueAtTime(4.5, now); // 4.5 pulses/sec

    const tremoloGain = this.audioCtx.createGain();
    tremoloGain.gain.setValueAtTime(0.5, now);

    tremolo.connect(tremoloGain);
    this.lfoOsc = tremolo;

    this.primaryOsc.connect(this.masterGain);
    this.harmonicOsc.connect(this.masterGain);

    this.primaryOsc.start(now);
    this.harmonicOsc.start(now);
    tremolo.start(now);
  }

  /**
   * Play warning double-beep (used during the 10-second pre-alarm grace countdown)
   */
  playWarningBeep(volume: number = 0.8) {
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.04);
      gain.gain.linearRampToValueAtTime(0, now + 0.16);
      gain.gain.linearRampToValueAtTime(volume, now + 0.22);
      gain.gain.linearRampToValueAtTime(0, now + 0.36);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch (e) {
      console.warn('Warning beep failed:', e);
    }
  }

  /**
   * Play dead man's handle disconnect alert (descending 3-tone emergency warning)
   */
  playDeadmanAlert(volume: number = 0.9) {
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const frequencies = [784, 622, 466]; // G5 -> D#5 -> A#4 descending alert

      frequencies.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const start = now + idx * 0.22;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(start);
        osc.stop(start + 0.22);
      });
    } catch (e) {
      console.warn('Deadman alert sound failed:', e);
    }
  }

  /**
   * Silence all active sirens and oscillators immediately
   */
  stop() {
    if (this.intervalTimer !== null) {
      window.clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.primaryOsc) {
      try {
        this.primaryOsc.stop();
        this.primaryOsc.disconnect();
      } catch {
        // Ignore
      }
      this.primaryOsc = null;
    }

    if (this.harmonicOsc) {
      try {
        this.harmonicOsc.stop();
        this.harmonicOsc.disconnect();
      } catch {
        // Ignore
      }
      this.harmonicOsc = null;
    }

    if (this.lfoOsc) {
      try {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
      } catch {
        // Ignore
      }
      this.lfoOsc = null;
    }

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore
      }
      this.masterGain = null;
    }

    if (this.compressor) {
      try {
        this.compressor.disconnect();
      } catch {
        // Ignore
      }
      this.compressor = null;
    }

    this.notifyStateChange(false);
  }

  isPlaying(): boolean {
    return this.isAlarmActive;
  }
}

export const audioAlarm = new AudioAlarmService();
