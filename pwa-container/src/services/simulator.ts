/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SensorSample } from '../types/seizure';

export type SimulatorScenario =
  | 'REST'
  | 'WALK'
  | 'SEIZURE'
  | 'DEADMAN_DISCONNECT'
  | 'LOW_BATTERY';

class SignalSimulator {
  private isRunning: boolean = false;
  private scenario: SimulatorScenario = 'REST';
  private timer: number | null = null;
  private sampleCounter: number = 0;
  private onSampleCallbacks: ((sample: SensorSample) => void)[] = [];
  private onBatteryChangeCallbacks: ((battery: number) => void)[] = [];
  private currentBattery: number = 88;

  start(scenario: SimulatorScenario = 'REST') {
    this.scenario = scenario;
    this.isRunning = true;
    this.sampleCounter = 0;

    if (this.timer) {
      window.clearInterval(this.timer);
    }

    // 25 Hz sampling rate = 40ms interval
    this.timer = window.setInterval(() => {
      this.tick();
    }, 40);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  setScenario(scenario: SimulatorScenario) {
    this.scenario = scenario;
    if (scenario === 'LOW_BATTERY') {
      this.currentBattery = 11; // Below 15% threshold
      this.onBatteryChangeCallbacks.forEach((cb) => cb(this.currentBattery));
    } else if (this.currentBattery < 50) {
      this.currentBattery = 88;
      this.onBatteryChangeCallbacks.forEach((cb) => cb(this.currentBattery));
    }
  }

  getScenario(): SimulatorScenario {
    return this.scenario;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  onSample(cb: (sample: SensorSample) => void) {
    this.onSampleCallbacks.push(cb);
    return () => {
      this.onSampleCallbacks = this.onSampleCallbacks.filter((c) => c !== cb);
    };
  }

  onBatteryChange(cb: (battery: number) => void) {
    this.onBatteryChangeCallbacks.push(cb);
    return () => {
      this.onBatteryChangeCallbacks = this.onBatteryChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private tick() {
    // If deadman scenario is active, stop transmitting packets to simulate BLE dropout
    if (this.scenario === 'DEADMAN_DISCONNECT') {
      return;
    }

    this.sampleCounter++;
    const t = this.sampleCounter / 25.0; // Seconds elapsed
    const now = Date.now();

    let x = 0;
    let y = 0;
    let z = 1.0; // 1G gravity base
    let hr = 70;

    if (this.scenario === 'REST') {
      // Quiet resting baseline: slight noise around 1G
      const noise = (Math.random() - 0.5) * 0.05;
      x = (Math.random() - 0.5) * 0.04;
      y = (Math.random() - 0.5) * 0.04;
      z = 0.98 + noise;
      hr = 66 + Math.sin(t * 0.2) * 3;
    } else if (this.scenario === 'WALK') {
      // Voluntary locomotion: 1.5 Hz step cadence + arm swing
      const stepFreq = 1.6; // 1.6 Hz
      const walkOsc = Math.sin(2 * Math.PI * stepFreq * t);
      const walkHarmonic = 0.4 * Math.sin(2 * Math.PI * (stepFreq * 2) * t);
      const armSwing = Math.cos(2 * Math.PI * stepFreq * t);

      x = 0.4 * armSwing + (Math.random() - 0.5) * 0.15;
      y = 0.3 * walkHarmonic + (Math.random() - 0.5) * 0.15;
      z = 1.0 + 0.6 * walkOsc + (Math.random() - 0.5) * 0.1;
      hr = 95 + Math.sin(t * 0.1) * 8;
    } else if (this.scenario === 'SEIZURE') {
      // Clonic convulsive tremor: 4.8 Hz strong rhythmic oscillation
      const tremorFreq = 4.8; // OpenSeizureDetector 3-8 Hz ROI core
      const tremorMagnitude = 2.4; // Strong jerk acceleration
      const tremorOsc = Math.sin(2 * Math.PI * tremorFreq * t);
      const crossAxisOsc = Math.cos(2 * Math.PI * tremorFreq * t);

      // Random jitter overlaid on rigid frequency
      const jitter = (Math.random() - 0.5) * 0.3;

      x = tremorMagnitude * 0.7 * tremorOsc + jitter;
      y = tremorMagnitude * 0.5 * crossAxisOsc + jitter;
      z = 1.0 + tremorMagnitude * 0.9 * tremorOsc + jitter;
      hr = 142 + Math.sin(t * 0.5) * 6; // Tachycardia
    } else if (this.scenario === 'LOW_BATTERY') {
      // Normal rest movement with depleted battery
      x = (Math.random() - 0.5) * 0.05;
      y = (Math.random() - 0.5) * 0.05;
      z = 0.99 + (Math.random() - 0.5) * 0.04;
      hr = 68;
    }

    const magnitude = Math.sqrt(x * x + y * y + z * z);

    const sample: SensorSample = {
      timestamp: now,
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
      magnitude: Math.round(magnitude * 1000) / 1000,
      sensorType: 'ACC',
      hr: Math.round(hr),
      rawX: Math.round(x * 1000),
      rawY: Math.round(y * 1000),
      rawZ: Math.round(z * 1000),
      packetNumber: this.sampleCounter,
      rawHex: `02 SIM ${this.sampleCounter.toString(16).padStart(4, '0').toUpperCase()}`,
      samplesInPacket: 1,
      actionName: `Simulator: ${this.scenario}`,
      actionSampleIndex: this.sampleCounter,
    };

    this.onSampleCallbacks.forEach((cb) => cb(sample));
  }
}

export const signalSimulator = new SignalSimulator();
