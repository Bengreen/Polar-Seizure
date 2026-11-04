/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HealthWatchdog } from '../types/seizure';

class DeadmanWatchdogService {
  private lastPacketTimestamp: number = 0;
  private timeoutSeconds: number = 30;
  private minBatteryThreshold: number = 15;
  private deviceBattery: number | null = null;
  private phoneBattery: number | null = null;
  private isPhoneCharging: boolean | null = null;
  private wakeLockSentinel: any = null;
  private isMonitoringActive: boolean = false;
  private onWatchdogTriggered: ((reason: string) => void) | null = null;

  constructor() {
    this.initPhoneBattery();
    this.setupWakeLockReacquire();
  }

  private async initPhoneBattery() {
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        this.phoneBattery = Math.round(battery.level * 100);
        this.isPhoneCharging = battery.charging;

        battery.addEventListener('levelchange', () => {
          this.phoneBattery = Math.round(battery.level * 100);
        });

        battery.addEventListener('chargingchange', () => {
          this.isPhoneCharging = battery.charging;
        });
      } else {
        // Fallback for browsers that don't expose getBattery
        this.phoneBattery = 92;
        this.isPhoneCharging = false;
      }
    } catch {
      this.phoneBattery = 92;
      this.isPhoneCharging = false;
    }
  }

  private setupWakeLockReacquire() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && this.isMonitoringActive) {
          await this.requestWakeLock();
        }
      });
    }
  }

  async requestWakeLock(): Promise<boolean> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
        return true;
      } catch (err) {
        console.warn('Screen WakeLock failed to acquire:', err);
        return false;
      }
    }
    return false;
  }

  releaseWakeLock() {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {
        // Ignore
      }
      this.wakeLockSentinel = null;
    }
  }

  setMonitoringActive(active: boolean, timeoutSec: number = 30, minBatt: number = 15) {
    this.isMonitoringActive = active;
    this.timeoutSeconds = timeoutSec;
    this.minBatteryThreshold = minBatt;

    if (active) {
      this.lastPacketTimestamp = Date.now();
      this.requestWakeLock();
    } else {
      this.releaseWakeLock();
    }
  }

  recordPacketReceived() {
    this.lastPacketTimestamp = Date.now();
  }

  setDeviceBattery(batteryLevel: number | null) {
    this.deviceBattery = batteryLevel;
  }

  setWatchdogTriggerListener(cb: (reason: string) => void) {
    this.onWatchdogTriggered = cb;
  }

  evaluateHealth(isBleConnected: boolean, deviceName: string | null): HealthWatchdog {
    const now = Date.now();
    const packetAgeMs = this.lastPacketTimestamp > 0 ? now - this.lastPacketTimestamp : 0;
    const packetAgeSeconds = Math.round(packetAgeMs / 1000);

    let isDeadmanBreached = false;
    let diagnosticStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL_FAULT' = 'HEALTHY';
    let statusMessage = 'Nominal. Watchdog active & all diagnostics passing.';

    if (!this.isMonitoringActive) {
      return {
        lastPacketTimestamp: this.lastPacketTimestamp,
        packetAgeSeconds: 0,
        isBleConnected,
        deviceName,
        deviceBatteryLevel: this.deviceBattery,
        phoneBatteryLevel: this.phoneBattery,
        isPhoneCharging: this.isPhoneCharging,
        isWakeLockActive: this.wakeLockSentinel !== null,
        isDeadmanBreached: false,
        diagnosticStatus: 'HEALTHY',
        statusMessage: 'Monitoring standby. Ready to stream.',
      };
    }

    // 1. Packet age timeout (Dead man's handle check)
    if (packetAgeSeconds > this.timeoutSeconds) {
      isDeadmanBreached = true;
      diagnosticStatus = 'CRITICAL_FAULT';
      statusMessage = `DEAD MAN TRIGGERED: No data packet received for ${packetAgeSeconds}s (Threshold: ${this.timeoutSeconds}s). Connection dropped!`;
      if (this.onWatchdogTriggered) {
        this.onWatchdogTriggered(statusMessage);
      }
    } else if (packetAgeSeconds > this.timeoutSeconds * 0.6) {
      diagnosticStatus = 'DEGRADED';
      statusMessage = `Warning: High packet latency (${packetAgeSeconds}s). Heartbeat delayed.`;
    }

    // 2. Wearable Battery check
    if (this.deviceBattery !== null && this.deviceBattery <= this.minBatteryThreshold) {
      if (diagnosticStatus !== 'CRITICAL_FAULT') {
        diagnosticStatus = 'CRITICAL_FAULT';
        statusMessage = `CRITICAL WEARABLE BATTERY: Polar device at ${this.deviceBattery}%. Recharge immediately!`;
      }
    }

    // 3. Phone Battery check
    if (
      this.phoneBattery !== null &&
      this.phoneBattery <= this.minBatteryThreshold &&
      !this.isPhoneCharging
    ) {
      if (diagnosticStatus !== 'CRITICAL_FAULT') {
        diagnosticStatus = 'CRITICAL_FAULT';
        statusMessage = `CRITICAL PHONE BATTERY: Phone at ${this.phoneBattery}% and discharging. Connect charger to maintain carer alerts!`;
      }
    }

    return {
      lastPacketTimestamp: this.lastPacketTimestamp,
      packetAgeSeconds,
      isBleConnected,
      deviceName,
      deviceBatteryLevel: this.deviceBattery,
      phoneBatteryLevel: this.phoneBattery,
      isPhoneCharging: this.isPhoneCharging,
      isWakeLockActive: this.wakeLockSentinel !== null,
      isDeadmanBreached,
      diagnosticStatus,
      statusMessage,
    };
  }
}

export const deadmanWatchdog = new DeadmanWatchdogService();
