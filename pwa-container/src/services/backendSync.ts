/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarerContact, DetectorState } from '../types/seizure';

export interface CloudWatchdogStatus {
  status: 'NOMINAL' | 'FAIL_SAFE_TRIGGERED' | 'AWAITING_INITIAL_HEARTBEAT' | 'OFFLINE';
  serverTime: number;
  heartbeatAgeSeconds: number | null;
  cloudTimeoutSeconds: number;
  cloudWatchdogHealthy: boolean;
  isCloudDeadmanBreached: boolean;
  lastHeartbeatTime?: number;
  recentAlerts?: Array<{ timestamp: number; type: string; message: string }>;
  isSyncing: boolean;
  lastSuccessfulSync?: number;
}

class BackendSyncService {
  private timer: number | null = null;
  private deviceId: string = 'patient-polar-01';
  private cachedStatus: CloudWatchdogStatus = {
    status: 'AWAITING_INITIAL_HEARTBEAT',
    serverTime: Date.now(),
    heartbeatAgeSeconds: null,
    cloudTimeoutSeconds: 45,
    cloudWatchdogHealthy: true,
    isCloudDeadmanBreached: false,
    isSyncing: false,
  };
  private onStatusChangeCallbacks: ((status: CloudWatchdogStatus) => void)[] = [];

  constructor() {
    // Generate or retrieve persistent patient device identifier
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem('osd_device_id');
      if (!id) {
        id = 'patient-polar-' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('osd_device_id', id);
      }
      this.deviceId = id;
    }
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  onStatusChange(cb: (status: CloudWatchdogStatus) => void) {
    this.onStatusChangeCallbacks.push(cb);
    return () => {
      this.onStatusChangeCallbacks = this.onStatusChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private notify(newStatus: CloudWatchdogStatus) {
    this.cachedStatus = newStatus;
    this.onStatusChangeCallbacks.forEach((cb) => cb(newStatus));
  }

  /**
   * Transmit live device heartbeat to the server-side dead man's handle watchdog
   */
  async sendHeartbeat(data: {
    detectorState: DetectorState;
    bleConnected: boolean;
    wearableBattery: number;
    phoneBattery: number;
    lastPacketAgeSeconds: number;
    peakRatio: number;
    peakFrequency: number;
    carerContacts: CarerContact[];
  }): Promise<boolean> {
    try {
      this.notify({ ...this.cachedStatus, isSyncing: true });

      const response = await fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          detectorState: data.detectorState,
          bleConnected: data.bleConnected,
          wearableBattery: data.wearableBattery,
          phoneBattery: data.phoneBattery,
          lastPacketAgeSeconds: data.lastPacketAgeSeconds,
          peakRatio: data.peakRatio,
          peakFrequency: data.peakFrequency,
          carerContacts: data.carerContacts.map((c) => ({
            name: c.name,
            phone: c.phone,
            relationship: c.relationship,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const resData = await response.json();
      const now = Date.now();

      this.notify({
        status: 'NOMINAL',
        serverTime: resData.serverTime || now,
        heartbeatAgeSeconds: 0,
        cloudTimeoutSeconds: resData.deadmanTimeoutSeconds || 45,
        cloudWatchdogHealthy: true,
        isCloudDeadmanBreached: false,
        isSyncing: false,
        lastSuccessfulSync: now,
      });

      return true;
    } catch (err) {
      console.warn('[BackendSync] Heartbeat send failed:', err);
      this.notify({
        ...this.cachedStatus,
        status: 'OFFLINE',
        isSyncing: false,
      });
      return false;
    }
  }

  /**
   * Fetch current cloud dead man's status from backend
   */
  async fetchCloudStatus(): Promise<CloudWatchdogStatus> {
    try {
      const response = await fetch(`/api/status?deviceId=${encodeURIComponent(this.deviceId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const status: CloudWatchdogStatus = {
        status: data.status,
        serverTime: data.serverTime,
        heartbeatAgeSeconds: data.heartbeatAgeSeconds,
        cloudTimeoutSeconds: data.cloudTimeoutSeconds || 45,
        cloudWatchdogHealthy: data.cloudWatchdogHealthy,
        isCloudDeadmanBreached: data.isCloudDeadmanBreached,
        lastHeartbeatTime: data.lastHeartbeatTime,
        recentAlerts: data.recentAlerts || [],
        isSyncing: false,
        lastSuccessfulSync: this.cachedStatus.lastSuccessfulSync,
      };

      this.notify(status);
      return status;
    } catch {
      const offlineStatus: CloudWatchdogStatus = {
        ...this.cachedStatus,
        status: 'OFFLINE',
        cloudWatchdogHealthy: false,
        isSyncing: false,
      };
      this.notify(offlineStatus);
      return offlineStatus;
    }
  }

  /**
   * Notify server of a confirmed seizure episode immediately
   */
  async notifyServerSeizureAlert(reason: string) {
    try {
      await fetch('/api/trigger-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          type: 'SEIZURE_ALARM',
          reason,
        }),
      });
    } catch (err) {
      console.warn('[BackendSync] Trigger alert failed:', err);
    }
  }
}

export const backendSync = new BackendSyncService();
