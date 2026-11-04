/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Audio API synthesizer for loud medical alarm sirens and warning chimes.
 * No external MP3 files needed; works reliably offline and in low-memory environments.
 */

class AudioAlarmService {
  private audioCtx: AudioContext | null = null;
  private isAlarmActive: boolean = false;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private intervalTimer: number | null = null;

  private initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Start high-priority medical emergency siren (alternating 850 Hz - 1250 Hz dual-frequency sweep)
   */
  startSeizureSiren(volume: number = 0.9) {
    this.stop(); // Stop any existing sound
    this.initContext();
    if (!this.audioCtx) return;

    this.isAlarmActive = true;

    try {
      // Main oscillator (sawtooth / square for harsh acoustic penetration)
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime);

      // Low-frequency oscillator to modulate pitch rapidly (2 Hz siren sweep)
      this.lfoOsc = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();

      this.lfoOsc.type = 'triangle';
      this.lfoOsc.frequency.setValueAtTime(2.5, this.audioCtx.currentTime); // 2.5 sweeps per second
      lfoGain.gain.setValueAtTime(350, this.audioCtx.currentTime); // sweep ±350 Hz

      this.lfoOsc.connect(lfoGain);
      lfoGain.connect(this.oscillator.frequency);

      // Master volume gain
      this.gainNode.gain.setValueAtTime(Math.max(0.1, Math.min(1.0, volume)), this.audioCtx.currentTime);

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();
      this.lfoOsc.start();
    } catch (e) {
      console.warn('Audio alarm could not play:', e);
    }
  }

  /**
   * Play warning double-beep (used during the 10-second pre-alarm grace countdown)
   */
  playWarningBeep(volume: number = 0.6) {
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.18);
      gain.gain.linearRampToValueAtTime(volume, now + 0.25);
      gain.gain.linearRampToValueAtTime(0, now + 0.38);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn('Warning beep failed:', e);
    }
  }

  /**
   * Play dead man's handle disconnect alert (descending 3-tone emergency warning)
   */
  playDeadmanAlert(volume: number = 0.8) {
    this.initContext();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const frequencies = [740, 587, 440]; // F#5 -> D5 -> A4 descending alarm

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
   * Silence all active sirens and oscillators
   */
  stop() {
    this.isAlarmActive = false;

    if (this.intervalTimer !== null) {
      window.clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.oscillator = null;
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

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  isPlaying(): boolean {
    return this.isAlarmActive;
  }
}

export const audioAlarm = new AudioAlarmService();
