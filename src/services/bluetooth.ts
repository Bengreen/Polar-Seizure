/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SensorSample } from '../types/seizure';

export type BluetoothStatus =
  | 'DISCONNECTED'
  | 'SCANNING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'STREAMING'
  | 'ERROR';

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  batteryLevel?: number;
  firmwareVersion?: string;
  hasHeartRate: boolean;
  hasAccelerometer: boolean;
}

// Known Polar BLE UUIDs
const POLAR_PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
const POLAR_PMD_CONTROL = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
const POLAR_PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';

class BluetoothService {
  private device: any = null;
  private server: any = null;
  private status: BluetoothStatus = 'DISCONNECTED';
  private onStatusChangeCallbacks: ((status: BluetoothStatus) => void)[] = [];
  private onSampleCallbacks: ((sample: SensorSample) => void)[] = [];
  private onBatteryChangeCallbacks: ((battery: number) => void)[] = [];
  private currentHr: number | undefined = undefined;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  getStatus(): BluetoothStatus {
    return this.status;
  }

  private setStatus(newStatus: BluetoothStatus) {
    this.status = newStatus;
    this.onStatusChangeCallbacks.forEach((cb) => cb(newStatus));
  }

  onStatusChange(cb: (status: BluetoothStatus) => void) {
    this.onStatusChangeCallbacks.push(cb);
    return () => {
      this.onStatusChangeCallbacks = this.onStatusChangeCallbacks.filter((c) => c !== cb);
    };
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

  async connect(): Promise<BluetoothDeviceInfo> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Google Chrome on Android or Desktop.');
    }

    try {
      this.setStatus('SCANNING');

      // Request device with Polar name prefix, Heart Rate, Battery, and Polar PMD services
      const navBluetooth = (navigator as any).bluetooth;
      this.device = await navBluetooth.requestDevice({
        filters: [
          { namePrefix: 'Polar' },
          { namePrefix: 'Polar Loop' },
          { services: ['heart_rate'] },
        ],
        optionalServices: [
          'heart_rate',
          'battery_service',
          'device_information',
          POLAR_PMD_SERVICE,
        ],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        console.warn('Polar BLE device disconnected unexpectedly');
        this.setStatus('DISCONNECTED');
      });

      this.setStatus('CONNECTING');
      this.server = await this.device.gatt.connect();

      const deviceInfo: BluetoothDeviceInfo = {
        id: this.device.id,
        name: this.device.name || 'Polar Sensor',
        hasHeartRate: false,
        hasAccelerometer: false,
      };

      // 1. Subscribe to Battery Service if available
      try {
        const batteryService = await this.server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        const batteryVal = await batteryChar.readValue();
        const batteryPct = batteryVal.getUint8(0);
        deviceInfo.batteryLevel = batteryPct;
        this.onBatteryChangeCallbacks.forEach((cb) => cb(batteryPct));

        batteryChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const val = event.target.value.getUint8(0);
          deviceInfo.batteryLevel = val;
          this.onBatteryChangeCallbacks.forEach((cb) => cb(val));
        });
        await batteryChar.startNotifications();
      } catch (e) {
        console.log('Battery service not available on this device:', e);
      }

      // 2. Subscribe to Heart Rate Service if available
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
        deviceInfo.hasHeartRate = true;

        hrChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const value = event.target.value;
          const flags = value.getUint8(0);
          const hr = (flags & 0x01) ? value.getUint16(1, true) : value.getUint8(1);
          this.currentHr = hr;
        });
        await hrChar.startNotifications();
      } catch (e) {
        console.log('Standard heart rate service not available on this device:', e);
      }

      // 3. Subscribe to Polar PMD Accelerometer stream if available
      try {
        const pmdService = await this.server.getPrimaryService(POLAR_PMD_SERVICE);
        const pmdDataChar = await pmdService.getCharacteristic(POLAR_PMD_DATA);
        const pmdCtrlChar = await pmdService.getCharacteristic(POLAR_PMD_CONTROL);

        deviceInfo.hasAccelerometer = true;

        pmdDataChar.addEventListener('characteristicvaluechanged', (event: any) => {
          this.handlePmdData(event.target.value);
        });
        await pmdDataChar.startNotifications();

        // Send start streaming command to PMD control point for 25 Hz / 52 Hz ACC
        // Opcode 0x02 = START, Measurement Type 0x02 = ACC, Sample rate 0x19 (25 Hz)
        const startCmd = new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]);
        await pmdCtrlChar.writeValue(startCmd);
      } catch (e) {
        console.log('Polar PMD service not initialized or device uses standard loop streaming:', e);
      }

      this.setStatus('STREAMING');
      return deviceInfo;
    } catch (err: unknown) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Bluetooth connection failed: ${msg}`);
    }
  }

  private handlePmdData(dataView: DataView) {
    if (dataView.byteLength < 10) return;
    const now = Date.now();

    // Polar PMD acceleration packet parsing
    // Format: [Type (1B), Timestamp (8B), FrameType (1B), Samples...]
    const type = dataView.getUint8(0);
    if (type === 0x02) {
      // ACC measurement
      for (let offset = 10; offset + 6 <= dataView.byteLength; offset += 6) {
        // Polar ACC values are signed 16-bit in milligravities (mG)
        const rawX = dataView.getInt16(offset, true) / 1000.0;
        const rawY = dataView.getInt16(offset + 2, true) / 1000.0;
        const rawZ = dataView.getInt16(offset + 4, true) / 1000.0;
        const magnitude = Math.sqrt(rawX * rawX + rawY * rawY + rawZ * rawZ);

        const sample: SensorSample = {
          timestamp: now,
          x: rawX,
          y: rawY,
          z: rawZ,
          magnitude,
          hr: this.currentHr,
        };

        this.onSampleCallbacks.forEach((cb) => cb(sample));
      }
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.setStatus('DISCONNECTED');
    this.device = null;
    this.server = null;
  }
}

export const bluetooth = new BluetoothService();
