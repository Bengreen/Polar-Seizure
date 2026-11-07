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

export type MotionStreamType = 'NONE' | 'GYRO' | 'ACC' | 'UNKNOWN';

export interface PmdAvailableSettings {
  sampleRates: number[];
  resolutions: number[];
  ranges: number[];
  channels: number[];
}

export interface BleStreamEvent {
  id: string;
  timestamp: number;
  type: 'DATA' | 'CTRL' | 'INFO' | 'WARN' | 'ERR';
  source?: string;
  message: string;
  byteLength?: number;
  hex?: string;
  ascii?: string;
}

export interface RawPacketRecord {
  id: number;
  timestamp: number;
  timeFormatted: string;
  intervalDeltaMs: number | null;
  byteLength: number;
  hex: string;
  bytes: number[];
  ascii: string;
  characteristic: 'PMD_DATA_FB005C82' | 'PMD_CTRL_FB005C81';
  parsedSummary?: string;
}

export interface StreamActionRecord {
  id: string;
  actionName: string;
  commandHex?: string;
  startTime: number;
  endTime?: number;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  samplesCaptured: number;
  packetsReceived: number;
  lastPacketTimestamp?: number;
  averageSamplesPerPacket: number;
  durationSeconds: number;
  error?: string;
}

export interface BleStreamDebugInfo {
  lastPacketTimestamp: number | null;
  totalBytesRead: number;
  totalPacketsRead: number;
  totalSamplesCaptured: number;
  lastPacketByteLength: number;
  lastPacketSamplesCount: number;
  lastPacketHex: string;
  lastPacketAscii: string;
  lastControlHex: string;
  lastControlTimestamp: number | null;
  dataNotificationActive: boolean;
  controlNotificationActive: boolean;
  currentAction: StreamActionRecord | null;
  actionHistory: StreamActionRecord[];
  recentEvents: BleStreamEvent[];
  rawPacketHistory: RawPacketRecord[];
}

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  batteryLevel?: number;
  firmwareVersion?: string;
  hasHeartRate: boolean;
  hasAccelerometer: boolean;
  hasGyroscope: boolean;
  activeStreamType: MotionStreamType;
  configuredSampleRate?: number;
  configuredRange?: number;
  discoveredServices: string[];
  lastPmdResponse?: string;
  availableSettings?: {
    gyro?: PmdAvailableSettings;
    acc?: PmdAvailableSettings;
  };
  packetsReceived: number;
  streamDebug: BleStreamDebugInfo;
}

// Known Polar BLE UUIDs
export const POLAR_PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
export const POLAR_PMD_CONTROL = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
export const POLAR_PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';
export const POLAR_SYNC_SERVICE = '0000fee7-0000-1000-8000-00805f9b34fb';
export const POLAR_FIRMWARE_SERVICE = '0000fee8-0000-1000-8000-00805f9b34fb';

// Polar PMD Measurement Types
export const PMD_TYPE_ECG = 0x00;
export const PMD_TYPE_PPG = 0x01;
export const PMD_TYPE_ACC = 0x02;
export const PMD_TYPE_PPI = 0x03;
export const PMD_TYPE_GYRO = 0x05;
export const PMD_TYPE_MAG = 0x06;

// Polar PMD Control Point Opcodes
export const PMD_OP_GET_SETTINGS = 0x01;
export const PMD_OP_START_MEASUREMENT = 0x02;
export const PMD_OP_STOP_MEASUREMENT = 0x03;
export const PMD_OP_RESPONSE = 0xf0;

// Polar PMD Setting Types
export const PMD_SETTING_SAMPLE_RATE = 0x00;
export const PMD_SETTING_RESOLUTION = 0x01;
export const PMD_SETTING_RANGE = 0x02;

// Polar PMD Status / Error Codes
export const PMD_STATUS_MAP: Record<number, string> = {
  0x00: 'SUCCESS',
  0x01: 'ERROR_INVALID_OPCODE',
  0x02: 'ERROR_INVALID_MEASUREMENT_TYPE',
  0x03: 'ERROR_NOT_SUPPORTED',
  0x04: 'ERROR_INVALID_LENGTH',
  0x05: 'ERROR_INVALID_PARAMETER',
  0x06: 'ERROR_ALREADY_IN_STATE',
  0x07: 'ERROR_INVALID_RESOLUTION',
  0x08: 'ERROR_INVALID_SAMPLE_RATE',
  0x09: 'ERROR_INVALID_RANGE',
  0x0a: 'ERROR_INVALID_MTU',
};

const ALL_OPTIONAL_SERVICES = [
  'heart_rate',
  '0000180d-0000-1000-8000-00805f9b34fb',
  'battery_service',
  '0000180f-0000-1000-8000-00805f9b34fb',
  'device_information',
  '0000180a-0000-1000-8000-00805f9b34fb',
  'generic_access',
  '00001800-0000-1000-8000-00805f9b34fb',
  'generic_attribute',
  '00001801-0000-1000-8000-00805f9b34fb',
  POLAR_PMD_SERVICE,
  POLAR_SYNC_SERVICE,
  POLAR_FIRMWARE_SERVICE,
];

export class BluetoothPermissionsPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BluetoothPermissionsPolicyError';
  }
}

export class BluetoothConnectionAttemptFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BluetoothConnectionAttemptFailedError';
  }
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (e) {
    return true;
  }
}

export function parsePmdSettingsPayload(dataView: DataView, startOffset: number = 4): PmdAvailableSettings {
  const result: PmdAvailableSettings = {
    sampleRates: [],
    resolutions: [],
    ranges: [],
    channels: [],
  };

  let offset = startOffset;
  while (offset + 2 <= dataView.byteLength) {
    const settingType = dataView.getUint8(offset);
    const count = dataView.getUint8(offset + 1);
    offset += 2;

    for (let i = 0; i < count; i++) {
      if (settingType === 0x04) {
        // Channels is uint8 in Polar PMD settings
        if (offset < dataView.byteLength) {
          result.channels.push(dataView.getUint8(offset));
          offset += 1;
        }
      } else {
        // SampleRate (0), Resolution (1), Range (2) are uint16 little-endian
        if (offset + 2 <= dataView.byteLength) {
          const val = dataView.getUint16(offset, true);
          offset += 2;
          if (settingType === PMD_SETTING_SAMPLE_RATE) {
            result.sampleRates.push(val);
          } else if (settingType === PMD_SETTING_RESOLUTION) {
            result.resolutions.push(val);
          } else if (settingType === PMD_SETTING_RANGE) {
            result.ranges.push(val);
          }
        }
      }
    }
  }

  return result;
}

export function serializePmdStartCommand(
  measurementType: number,
  settings: PmdAvailableSettings
): { command: Uint8Array; sampleRate: number; range: number } {
  // 1. Determine sample rate: prefer 25 Hz or 50 Hz or 52 Hz
  let sampleRate = 25;
  if (settings.sampleRates.length > 0) {
    if (settings.sampleRates.includes(25)) sampleRate = 25;
    else if (settings.sampleRates.includes(50)) sampleRate = 50;
    else if (settings.sampleRates.includes(52)) sampleRate = 52;
    else if (settings.sampleRates.includes(100)) sampleRate = 100;
    else sampleRate = settings.sampleRates[0];
  }

  // 2. Determine resolution: prefer 16-bit
  let resolution = 16;
  if (settings.resolutions.length > 0) {
    if (settings.resolutions.includes(16)) resolution = 16;
    else resolution = settings.resolutions[0];
  }

  // 3. Determine range:
  // For GYRO (0x05): prefer 2000 dps
  // For ACC (0x02): prefer 8G, 2G, or 4G
  let range = measurementType === PMD_TYPE_GYRO ? 2000 : 8;
  if (settings.ranges.length > 0) {
    if (measurementType === PMD_TYPE_GYRO) {
      if (settings.ranges.includes(2000)) range = 2000;
      else if (settings.ranges.includes(1000)) range = 1000;
      else range = settings.ranges[0];
    } else {
      if (settings.ranges.includes(8)) range = 8;
      else if (settings.ranges.includes(2)) range = 2;
      else if (settings.ranges.includes(4)) range = 4;
      else range = settings.ranges[0];
    }
  }

  // Polar PMD Start command format: 14 bytes
  // [0x02, measurementType, Setting0 (sample_rate), Setting1 (resolution), Setting2 (range)]
  // Channels (0x04) is NOT included in StartMeasurement per Polar BLE SDK
  const bytes: number[] = [
    PMD_OP_START_MEASUREMENT, // 0x02
    measurementType,          // 0x05 for GYRO or 0x02 for ACC
    // Setting 0: SAMPLE_RATE (uint16)
    PMD_SETTING_SAMPLE_RATE, 0x01, sampleRate & 0xff, (sampleRate >> 8) & 0xff,
    // Setting 1: RESOLUTION (uint16)
    PMD_SETTING_RESOLUTION, 0x01, resolution & 0xff, (resolution >> 8) & 0xff,
    // Setting 2: RANGE (uint16)
    PMD_SETTING_RANGE, 0x01, range & 0xff, (range >> 8) & 0xff,
  ];

  return { command: new Uint8Array(bytes), sampleRate, range };
}

class BluetoothService {
  private device: any = null;
  private server: any = null;
  private status: BluetoothStatus = 'DISCONNECTED';
  private pmdControlChar: any = null;
  private pmdDataChar: any = null;
  private batteryChar: any = null;
  private keepAliveTimer: any = null;

  private currentHr: number | undefined = undefined;
  private activeStreamType: MotionStreamType = 'NONE';
  private configuredSampleRate: number = 25;
  private configuredRange: number = 8;
  private packetsReceived: number = 0;
  private lastPmdResponse: string = '';

  private pendingSettingsResolvers: Map<
    number,
    { resolve: (s: PmdAvailableSettings) => void; reject: (err: Error) => void }
  > = new Map();

  private pendingStartResolvers: Map<
    number,
    { resolve: (status: number) => void; reject: (err: Error) => void }
  > = new Map();

  private pendingStopResolvers: Map<
    number,
    { resolve: (status: number) => void; reject: (err: Error) => void }
  > = new Map();

  private onStatusChangeCallbacks: ((status: BluetoothStatus) => void)[] = [];
  private onSampleCallbacks: ((sample: SensorSample) => void)[] = [];
  private onBatteryChangeCallbacks: ((battery: number) => void)[] = [];
  private onKeepAliveCallbacks: ((timestamp: number) => void)[] = [];
  private onDeviceInfoCallbacks: ((info: BluetoothDeviceInfo) => void)[] = [];

  private rawPackets: RawPacketRecord[] = [];
  private rawPacketCounter: number = 0;
  private currentAction: StreamActionRecord | null = null;
  private actionHistory: StreamActionRecord[] = [];
  private totalSamplesCaptured: number = 0;

  private streamDebug: BleStreamDebugInfo = {
    lastPacketTimestamp: null,
    totalBytesRead: 0,
    totalPacketsRead: 0,
    totalSamplesCaptured: 0,
    lastPacketByteLength: 0,
    lastPacketSamplesCount: 0,
    lastPacketHex: '',
    lastPacketAscii: '',
    lastControlHex: '',
    lastControlTimestamp: null,
    dataNotificationActive: false,
    controlNotificationActive: false,
    currentAction: null,
    actionHistory: [],
    recentEvents: [],
    rawPacketHistory: [],
  };

  private currentDeviceInfo: BluetoothDeviceInfo = {
    id: '',
    name: 'Polar Device',
    hasHeartRate: false,
    hasAccelerometer: false,
    hasGyroscope: false,
    activeStreamType: 'NONE',
    discoveredServices: [],
    packetsReceived: 0,
    availableSettings: {},
    streamDebug: {
      lastPacketTimestamp: null,
      totalBytesRead: 0,
      totalPacketsRead: 0,
      totalSamplesCaptured: 0,
      lastPacketByteLength: 0,
      lastPacketSamplesCount: 0,
      lastPacketHex: '',
      lastPacketAscii: '',
      lastControlHex: '',
      lastControlTimestamp: null,
      dataNotificationActive: false,
      controlNotificationActive: false,
      currentAction: null,
      actionHistory: [],
      recentEvents: [],
      rawPacketHistory: [],
    },
  };

  startAction(actionName: string, commandHex?: string): StreamActionRecord {
    if (this.currentAction && this.currentAction.status === 'ACTIVE') {
      this.currentAction.status = 'COMPLETED';
      this.currentAction.endTime = Date.now();
      this.currentAction.durationSeconds = Math.max(0, (this.currentAction.endTime - this.currentAction.startTime) / 1000);
      this.actionHistory.unshift({ ...this.currentAction });
      if (this.actionHistory.length > 50) {
        this.actionHistory.pop();
      }
    }
    const newAction: StreamActionRecord = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actionName,
      commandHex,
      startTime: Date.now(),
      status: 'ACTIVE',
      samplesCaptured: 0,
      packetsReceived: 0,
      averageSamplesPerPacket: 0,
      durationSeconds: 0,
    };
    this.currentAction = newAction;
    this.streamDebug.currentAction = newAction;
    this.streamDebug.actionHistory = this.actionHistory;
    this.notifyDeviceInfo();
    return newAction;
  }

  completeCurrentAction(error?: string): void {
    if (this.currentAction && this.currentAction.status === 'ACTIVE') {
      this.currentAction.status = error ? 'FAILED' : 'COMPLETED';
      this.currentAction.error = error;
      this.currentAction.endTime = Date.now();
      this.currentAction.durationSeconds = Math.max(0, (this.currentAction.endTime - this.currentAction.startTime) / 1000);
      this.actionHistory.unshift({ ...this.currentAction });
      if (this.actionHistory.length > 50) {
        this.actionHistory.pop();
      }
      this.currentAction = null;
      this.streamDebug.currentAction = null;
      this.streamDebug.actionHistory = this.actionHistory;
      this.notifyDeviceInfo();
    }
  }

  logStreamEvent(
    type: 'DATA' | 'CTRL' | 'INFO' | 'WARN' | 'ERR',
    message: string,
    dataView?: DataView,
    source?: string
  ) {
    const now = Date.now();
    let hex = '';
    let ascii = '';
    let byteLength = 0;
    if (dataView) {
      byteLength = dataView.byteLength;
      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      const slice = bytes.slice(0, 32);
      hex = Array.from(slice)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      if (bytes.length > 32) hex += ` ...(+${bytes.length - 32}B)`;
      ascii = Array.from(slice)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·'))
        .join('');
    }
    const event: BleStreamEvent = {
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      type,
      source,
      message,
      byteLength,
      hex,
      ascii,
    };
    this.streamDebug.recentEvents = [event, ...this.streamDebug.recentEvents.slice(0, 39)];
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  getStatus(): BluetoothStatus {
    return this.status;
  }

  getDeviceInfo(): BluetoothDeviceInfo {
    return {
      ...this.currentDeviceInfo,
      activeStreamType: this.activeStreamType,
      configuredSampleRate: this.configuredSampleRate,
      configuredRange: this.configuredRange,
      packetsReceived: this.packetsReceived,
      lastPmdResponse: this.lastPmdResponse,
      streamDebug: {
        ...this.streamDebug,
        totalPacketsRead: this.packetsReceived,
      },
    };
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

  onKeepAlive(cb: (timestamp: number) => void) {
    this.onKeepAliveCallbacks.push(cb);
    return () => {
      this.onKeepAliveCallbacks = this.onKeepAliveCallbacks.filter((c) => c !== cb);
    };
  }

  onDeviceInfo(cb: (info: BluetoothDeviceInfo) => void) {
    this.onDeviceInfoCallbacks.push(cb);
    return () => {
      this.onDeviceInfoCallbacks = this.onDeviceInfoCallbacks.filter((c) => c !== cb);
    };
  }

  private notifyDeviceInfo() {
    const updated = this.getDeviceInfo();
    this.onDeviceInfoCallbacks.forEach((cb) => cb(updated));
  }

  async connect(options?: { acceptAllDevices?: boolean }): Promise<BluetoothDeviceInfo> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Google Chrome on Android or Desktop.'
      );
    }

    try {
      this.setStatus('SCANNING');
      this.packetsReceived = 0;
      this.lastPmdResponse = '';

      const navBluetooth = (navigator as any).bluetooth;
      if (!navBluetooth || typeof navBluetooth.requestDevice !== 'function') {
        throw new Error('Web Bluetooth requestDevice is not available in this context.');
      }

      // Scan options: Filtered Polar mode vs Unfiltered Any Device mode
      const requestOptions: any = options?.acceptAllDevices
        ? {
            acceptAllDevices: true,
            optionalServices: ALL_OPTIONAL_SERVICES,
          }
        : {
            filters: [
              { namePrefix: 'Polar' },
              { namePrefix: 'polar' },
              { namePrefix: 'Loop' },
              { namePrefix: 'loop' },
              { services: ['heart_rate'] },
              { services: ['battery_service'] },
            ],
            optionalServices: ALL_OPTIONAL_SERVICES,
          };

      this.device = await navBluetooth.requestDevice(requestOptions);

      this.device.addEventListener('gattserverdisconnected', () => {
        console.warn('[BLE] Polar device disconnected unexpectedly');
        this.setStatus('DISCONNECTED');
        this.activeStreamType = 'NONE';
        this.stopKeepAlive();
        this.notifyDeviceInfo();
      });

      this.setStatus('CONNECTING');

      // Attempt GATT connection with backoff
      let connectedServer: any = null;
      let lastGattError: unknown = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (this.device.gatt?.connected) {
            connectedServer = this.device.gatt;
            break;
          }

          try {
            await this.device.gatt?.disconnect();
          } catch (_) {}

          if (attempt > 1) {
            await new Promise((r) => setTimeout(r, 600));
          }

          connectedServer = await this.device.gatt.connect();
          if (connectedServer && connectedServer.connected) {
            break;
          }
        } catch (err) {
          lastGattError = err;
          console.warn(`[BLE] GATT connection attempt ${attempt} failed:`, err);
        }
      }

      if (!connectedServer || !connectedServer.connected) {
        throw lastGattError || new Error('Connection attempt failed');
      }

      this.server = connectedServer;

      this.currentDeviceInfo = {
        id: this.device.id,
        name: this.device.name || 'Polar Sensor',
        hasHeartRate: false,
        hasAccelerometer: false,
        hasGyroscope: false,
        activeStreamType: 'NONE',
        discoveredServices: [],
        packetsReceived: 0,
        availableSettings: {},
        streamDebug: this.streamDebug,
      };

      // 0. Enumerate all available primary services
      try {
        const services = await this.server.getPrimaryServices();
        this.currentDeviceInfo.discoveredServices = services.map((s: any) => s.uuid);
        console.log('[BLE] Discovered services on device:', this.currentDeviceInfo.discoveredServices);
      } catch (e) {
        console.log('[BLE] Could not list all services:', e);
      }

      // 1. Subscribe to Battery Service if available
      try {
        const batteryService = await this.server.getPrimaryService('battery_service');
        const batteryChar = await batteryService.getCharacteristic('battery_level');
        this.batteryChar = batteryChar;
        const batteryVal = await batteryChar.readValue();
        const batteryPct = batteryVal.getUint8(0);
        this.currentDeviceInfo.batteryLevel = batteryPct;
        this.onBatteryChangeCallbacks.forEach((cb) => cb(batteryPct));

        batteryChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const val = event.target.value.getUint8(0);
          this.currentDeviceInfo.batteryLevel = val;
          this.onBatteryChangeCallbacks.forEach((cb) => cb(val));
          this.notifyDeviceInfo();
        });
        await batteryChar.startNotifications();
      } catch (e) {
        console.log('[BLE] Battery service not available or failed:', e);
      }

      // 2. Subscribe to Heart Rate Service if available
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
        this.currentDeviceInfo.hasHeartRate = true;

        hrChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const value = event.target.value;
          const flags = value.getUint8(0);
          const hr = flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
          this.currentHr = hr;
        });
        await hrChar.startNotifications();
      } catch (e) {
        console.log('[BLE] Standard heart rate service not available:', e);
      }

      // 3. Setup Polar Measurement Data (PMD) using SDK Settings Discovery
      await this.initPolarPmdMotionStream();

      // Start periodic Keep-Alive to maintain link and refresh Dead Man watchdog
      this.startKeepAlive();

      this.setStatus(this.activeStreamType !== 'NONE' ? 'STREAMING' : 'CONNECTED');
      this.notifyDeviceInfo();

      return this.getDeviceInfo();
    } catch (err: unknown) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('permissions policy') ||
        msg.includes('disallowed') ||
        (err instanceof Error && err.name === 'SecurityError')
      ) {
        throw new BluetoothPermissionsPolicyError(
          'Web Bluetooth is disallowed by permissions policy inside embedded preview frames. Please open the app in a standalone tab or install it as a PWA on your Android phone to pair real Polar hardware.'
        );
      }
      if (
        msg.includes('Connection attempt failed') ||
        msg.includes('Connection Error') ||
        msg.includes('NetworkError')
      ) {
        throw new BluetoothConnectionAttemptFailedError(
          "Connection attempt failed: The Polar device may already be connected to the Polar Flow app or paired in your phone's Android Bluetooth settings. BLE wearables only permit ONE active connection. Please unpair the Polar Loop in Android settings, close Polar Flow, tap the touch button to wake it up, and try again."
        );
      }
      throw new Error(`Bluetooth connection failed: ${msg}`);
    }
  }

  /**
   * Initializes Polar PMD motion stream following the Polar BLE SDK protocol:
   * 1. Enable Data characteristic notifications
   * 2. Enable Control Point characteristic notifications
   * 3. Cascade attempt: Gyroscope (0x05) first, then Accelerometer (0x02)
   */
  private async initPolarPmdMotionStream() {
    try {
      console.log('[BLE] Connecting to Polar PMD service:', POLAR_PMD_SERVICE);
      const pmdService = await this.server.getPrimaryService(POLAR_PMD_SERVICE);

      this.pmdControlChar = await pmdService.getCharacteristic(POLAR_PMD_CONTROL);
      this.pmdDataChar = await pmdService.getCharacteristic(POLAR_PMD_DATA);

      // STEP A: Enable notifications on PMD Data characteristic
      this.pmdDataChar.addEventListener('characteristicvaluechanged', (event: any) => {
        try {
          this.handlePmdData(event.target.value);
        } catch (err) {
          console.error('[BLE] Error in handlePmdData listener:', err);
          this.logStreamEvent('ERR', `Error in PMD Data listener: ${err instanceof Error ? err.message : String(err)}`, undefined, 'PMD_DATA');
        }
      });
      await this.pmdDataChar.startNotifications();
      this.streamDebug.dataNotificationActive = true;
      this.logStreamEvent('INFO', 'Notifications enabled on PMD Data characteristic (FB005C82)', undefined, 'PMD_INIT');
      console.log('[BLE] PMD Data characteristic notifications enabled');

      // STEP B: Enable notifications on PMD Control Point characteristic
      this.pmdControlChar.addEventListener('characteristicvaluechanged', (event: any) => {
        try {
          this.handlePmdControlResponse(event.target.value);
        } catch (err) {
          console.error('[BLE] Error in handlePmdControlResponse listener:', err);
          this.logStreamEvent('ERR', `Error in PMD Control listener: ${err instanceof Error ? err.message : String(err)}`, undefined, 'PMD_CTRL');
        }
      });
      await this.pmdControlChar.startNotifications();
      this.streamDebug.controlNotificationActive = true;
      this.logStreamEvent('INFO', 'Notifications enabled on PMD Control Point characteristic (FB005C81)', undefined, 'PMD_INIT');
      console.log('[BLE] PMD Control Point notifications enabled');

      // Settling delay after characteristic notifications registration
      await new Promise((r) => setTimeout(r, 200));

      // Polar BLE SDK rule: Always clear previous session state with STOP before START
      // Prevents ERROR_ALREADY_IN_STATE (0x06) and 1-packet FIFO stall on reconnection
      console.log('[BLE] Resetting PMD state with clean STOP [03 02] before starting stream...');
      this.logStreamEvent('INFO', 'Clearing previous session state with STOP [03 02]...', undefined, 'PMD_INIT');
      await this.sendStopCommandAndWait(PMD_TYPE_ACC, 600);
      await new Promise((r) => setTimeout(r, 300));

      // STEP C: Initialize hardware Accelerometer (0x02) stream directly
      console.log('[BLE] Starting Accelerometer (0x02) motion stream...');
      const accStarted = await this.startAccStream();
      if (accStarted) {
        this.currentDeviceInfo.hasAccelerometer = true;
        this.activeStreamType = 'ACC';
        this.setStatus('STREAMING');
        this.notifyDeviceInfo();
      } else {
        // Fallback: minimal start command with reset
        await this.kickstartStream();
      }
    } catch (e) {
      console.warn('[BLE] Polar PMD service setup error:', e);
    }
  }

  /**
   * Requests supported measurement settings for a given feature from the device
   * sends Opcode 0x01 [PMD_OP_GET_SETTINGS, measurementType]
   */
  async requestStreamSettings(measurementType: number, timeoutMs: number = 2000): Promise<PmdAvailableSettings> {
    if (!this.pmdControlChar) {
      throw new Error('PMD Control characteristic is not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSettingsResolvers.delete(measurementType);
        reject(new Error(`Timeout waiting for settings response for type 0x${measurementType.toString(16)}`));
      }, timeoutMs);

      this.pendingSettingsResolvers.set(measurementType, {
        resolve: (settings) => {
          clearTimeout(timer);
          this.pendingSettingsResolvers.delete(measurementType);
          resolve(settings);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pendingSettingsResolvers.delete(measurementType);
          reject(err);
        },
      });

      const reqCmd = new Uint8Array([PMD_OP_GET_SETTINGS, measurementType]);
      this.writeControlPoint(reqCmd).catch((err) => {
        clearTimeout(timer);
        this.pendingSettingsResolvers.delete(measurementType);
        reject(err);
      });
    });
  }

  /**
   * Sends a Start command and safely waits for status response without throwing unhandled exceptions
   */
  private async sendStartCommandAndWait(measurementType: number, commandBytes: Uint8Array): Promise<number> {
    return new Promise<number>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingStartResolvers.delete(measurementType);
        // Timeout means device did not acknowledge; return error code
        resolve(0x05); // ERROR_INVALID_PARAMETER
      }, 2000);

      this.pendingStartResolvers.set(measurementType, {
        resolve: (status) => {
          clearTimeout(timeout);
          this.pendingStartResolvers.delete(measurementType);
          resolve(status);
        },
        reject: (_err) => {
          clearTimeout(timeout);
          this.pendingStartResolvers.delete(measurementType);
          resolve(0x05);
        },
      });

      this.writeControlPoint(commandBytes).catch((err) => {
        clearTimeout(timeout);
        this.pendingStartResolvers.delete(measurementType);
        console.warn('[BLE] Write control point error:', err);
        resolve(0x05);
      });
    });
  }

  /**
   * Sends a Stop command and safely waits for confirmation
   */
  async sendStopCommandAndWait(measurementType: number, timeoutMs: number = 1000): Promise<number> {
    if (!this.pmdControlChar) return 0x00;
    return new Promise<number>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingStopResolvers.delete(measurementType);
        resolve(0x00);
      }, timeoutMs);

      this.pendingStopResolvers.set(measurementType, {
        resolve: (status) => {
          clearTimeout(timeout);
          this.pendingStopResolvers.delete(measurementType);
          resolve(status);
        },
        reject: () => {
          clearTimeout(timeout);
          this.pendingStopResolvers.delete(measurementType);
          resolve(0x00);
        },
      });

      const stopCmd = new Uint8Array([PMD_OP_STOP_MEASUREMENT, measurementType]);
      this.writeControlPoint(stopCmd).catch(() => {
        clearTimeout(timeout);
        this.pendingStopResolvers.delete(measurementType);
        resolve(0x00);
      });
    });
  }

  /**
   * Negotiates and starts a measurement stream using multi-tier settings cascade
   */
  private async startMeasurementWithNegotiation(measurementType: number): Promise<boolean> {
    if (!this.pmdControlChar) return false;

    try {
      // 1. Try querying device settings first
      let settings: PmdAvailableSettings | null = null;
      try {
        settings = await this.requestStreamSettings(measurementType, 1200);
        console.log(`[BLE] Discovered device settings for 0x${measurementType.toString(16)}:`, settings);
        if (!this.currentDeviceInfo.availableSettings) {
          this.currentDeviceInfo.availableSettings = {};
        }
        if (measurementType === PMD_TYPE_GYRO) {
          this.currentDeviceInfo.availableSettings.gyro = settings;
        } else if (measurementType === PMD_TYPE_ACC) {
          this.currentDeviceInfo.availableSettings.acc = settings;
        }
      } catch (err: any) {
        console.log(`[BLE] Settings query for 0x${measurementType.toString(16)} returned:`, err.message);
        if (err.message?.includes('NOT_SUPPORTED') || err.message?.includes('INVALID_MEASUREMENT_TYPE')) {
          if (measurementType === PMD_TYPE_GYRO) {
            console.warn('[BLE] Gyroscope is not supported on this device hardware.');
          }
          return false;
        }
      }

      // Candidate command payloads to try in order of preference
      const candidateCommands: { cmd: Uint8Array; rate: number; range: number; label: string }[] = [];

      // If device reported settings, prioritize them
      if (settings && (settings.sampleRates.length > 0 || settings.ranges.length > 0)) {
        const primary = serializePmdStartCommand(measurementType, settings);
        candidateCommands.push({
          cmd: primary.command,
          rate: primary.sampleRate,
          range: primary.range,
          label: `Negotiated (${primary.sampleRate}Hz, Range ${primary.range})`,
        });
      }

      if (measurementType === PMD_TYPE_GYRO) {
        // Gyro candidates (rates: 25Hz, 52Hz; range: 2000 dps)
        candidateCommands.push(
          {
            cmd: new Uint8Array([0x02, 0x05, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0xd0, 0x07]),
            rate: 25,
            range: 2000,
            label: 'Gyro 25Hz 16-bit 2000dps',
          },
          {
            cmd: new Uint8Array([0x02, 0x05, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0xd0, 0x07]),
            rate: 52,
            range: 2000,
            label: 'Gyro 52Hz 16-bit 2000dps',
          },
          {
            cmd: new Uint8Array([0x02, 0x05]),
            rate: 25,
            range: 2000,
            label: 'Gyro Minimal [0x02, 0x05]',
          }
        );
      } else {
        // Standard Polar ACC start commands (Rate-first and Range-first candidate TLVs)
        candidateCommands.push(
          // 1. Range-First 25 Hz 16-bit 8G (Required on Polar Loop 2 / early PMD firmware)
          {
            cmd: new Uint8Array([0x02, 0x02, 0x02, 0x01, 0x08, 0x00, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00]),
            rate: 25,
            range: 8,
            label: 'Range-First ACC 25Hz 16-bit 8G',
          },
          // 2. 25 Hz, 16-bit, 8G (Standard Polar PMD Rate-First)
          {
            cmd: new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]),
            rate: 25,
            range: 8,
            label: 'Rate-First ACC 25Hz 16-bit 8G',
          },
          // 3. 25 Hz, 8-bit, 8G (Polar Loop 2 native 8-bit frame format)
          {
            cmd: new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x08, 0x00, 0x02, 0x01, 0x08, 0x00]),
            rate: 25,
            range: 8,
            label: 'ACC 25Hz 8-bit 8G',
          },
          // 4. Range-First 25 Hz 16-bit 2G
          {
            cmd: new Uint8Array([0x02, 0x02, 0x02, 0x01, 0x02, 0x00, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00]),
            rate: 25,
            range: 2,
            label: 'Range-First ACC 25Hz 16-bit 2G',
          },
          // 5. Minimal [0x02, 0x02] (Device default hardware settings)
          {
            cmd: new Uint8Array([0x02, 0x02]),
            rate: 25,
            range: 8,
            label: 'ACC Minimal [0x02, 0x02]',
          },
          // 6. 52 Hz, 16-bit, 8G
          {
            cmd: new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]),
            rate: 52,
            range: 8,
            label: 'ACC 52Hz 16-bit 8G',
          },
          // 7. 52 Hz, 8-bit, 8G
          {
            cmd: new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x08, 0x00, 0x02, 0x01, 0x08, 0x00]),
            rate: 52,
            range: 8,
            label: 'ACC 52Hz 8-bit 8G',
          },
          // 8. 25 Hz, 16-bit, 2G
          {
            cmd: new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x02, 0x00]),
            rate: 25,
            range: 2,
            label: 'ACC 25Hz 16-bit 2G',
          }
        );
      }

      // Try candidates sequentially until one returns SUCCESS (0x00)
      for (const candidate of candidateCommands) {
        console.log(`[BLE] Attempting start command for 0x${measurementType.toString(16)}: ${candidate.label}`);

        const status = await this.sendStartCommandAndWait(measurementType, candidate.cmd);

        if (status === 0x00) {
          console.log(`[BLE] Stream 0x${measurementType.toString(16)} started successfully with ${candidate.label}`);
          this.activeStreamType = measurementType === PMD_TYPE_GYRO ? 'GYRO' : 'ACC';
          this.configuredSampleRate = candidate.rate;
          this.configuredRange = candidate.range;
          if (measurementType === PMD_TYPE_GYRO) {
            this.currentDeviceInfo.hasGyroscope = true;
          } else {
            this.currentDeviceInfo.hasAccelerometer = true;
          }
          this.setStatus('STREAMING');
          this.notifyDeviceInfo();
          return true;
        } else if (status === 0x06) {
          // ALREADY_IN_STATE: Polar BLE SDK requires sending STOP [03 02] to clear state, waiting, then retrying
          console.warn(`[BLE] Stream 0x${measurementType.toString(16)} already active. Sending STOP [03 02], waiting 400ms, then starting...`);
          this.logStreamEvent('WARN', `Received ALREADY_IN_STATE (0x06). Sending STOP [03 02] to reset device state...`, undefined, 'PMD_CTRL');
          await this.sendStopCommandAndWait(measurementType, 800);
          await new Promise((r) => setTimeout(r, 400));
          const retryStatus = await this.sendStartCommandAndWait(measurementType, candidate.cmd);
          if (retryStatus === 0x00 || retryStatus === 0x06) {
            console.log(`[BLE] Stream 0x${measurementType.toString(16)} activated successfully on restart`);
            this.activeStreamType = measurementType === PMD_TYPE_GYRO ? 'GYRO' : 'ACC';
            this.configuredSampleRate = candidate.rate;
            this.configuredRange = candidate.range;
            if (measurementType === PMD_TYPE_GYRO) {
              this.currentDeviceInfo.hasGyroscope = true;
            } else {
              this.currentDeviceInfo.hasAccelerometer = true;
            }
            this.setStatus('STREAMING');
            this.notifyDeviceInfo();
            return true;
          }
        }
      }

      return false;
    } catch (err) {
      console.warn(`[BLE] startMeasurementWithNegotiation error:`, err);
      return false;
    }
  }

  /**
   * Helper to write to PMD Control characteristic safely
   */
  private async writeControlPoint(bytes: Uint8Array): Promise<void> {
    if (!this.pmdControlChar) {
      throw new Error('PMD Control characteristic is unavailable');
    }
    if (typeof this.pmdControlChar.writeValueWithResponse === 'function') {
      await this.pmdControlChar.writeValueWithResponse(bytes);
    } else {
      await this.pmdControlChar.writeValue(bytes);
    }
  }

  /**
   * Sends Start Gyroscope command (Type 0x05) to Polar PMD Control Point
   */
  async startGyroStream(): Promise<boolean> {
    return this.startMeasurementWithNegotiation(PMD_TYPE_GYRO);
  }

  /**
   * Sends Start Accelerometer command (Type 0x02) to Polar PMD Control Point
   */
  async startAccStream(): Promise<boolean> {
    return this.startMeasurementWithNegotiation(PMD_TYPE_ACC);
  }

  /**
   * Stops active Polar PMD measurement stream
   */
  async stopStream(targetType?: number): Promise<void> {
    if (!this.pmdControlChar) return;
    try {
      const typeByte =
        targetType !== undefined
          ? targetType
          : this.activeStreamType === 'GYRO'
          ? PMD_TYPE_GYRO
          : PMD_TYPE_ACC;
      const stopCmd = new Uint8Array([PMD_OP_STOP_MEASUREMENT, typeByte]);
      await this.writeControlPoint(stopCmd);
      this.activeStreamType = 'NONE';
      this.notifyDeviceInfo();
    } catch (err) {
      console.warn('[BLE] Stop PMD stream failed:', err);
    }
  }

  /**
   * Restarts active Polar PMD measurement stream cleanly
   */
  async restartStream(): Promise<boolean> {
    console.log('[BLE] User requested stream restart...');
    await this.stopStream();
    await new Promise((r) => setTimeout(r, 500));
    return this.startAccStream();
  }

  /**
   * Handles PMD Control Point indications / responses:
   * Byte 0: 0xF0 (Response Code)
   * Byte 1: Opcode being replied to (0x01: GetSettings, 0x02: Start, 0x03: Stop)
   * Byte 2: Measurement Type (0x05: GYRO, 0x02: ACC, 0x01: PPG, 0x00: ECG)
   * Byte 3: Status / Error Code (0x00: SUCCESS)
   * Byte 4+: Settings Payload (when Opcode is 0x01 and Status is 0x00)
   */
  private handlePmdControlResponse(dataView: DataView) {
    if (dataView.byteLength < 4) return;
    const responseCode = dataView.getUint8(0); // 0xF0
    const opcode = dataView.getUint8(1);       // 0x01, 0x02, 0x03
    const measurementType = dataView.getUint8(2); // 0x05 (GYRO), 0x02 (ACC), 0x01 (PPG), etc.
    const status = dataView.getUint8(3);       // Error code / status byte

    const statusMsg = PMD_STATUS_MAP[status] || `ERROR_0x${status.toString(16)}`;
    const typeLabel =
      measurementType === PMD_TYPE_GYRO
        ? 'GYRO (0x05)'
        : measurementType === PMD_TYPE_ACC
        ? 'ACC (0x02)'
        : measurementType === PMD_TYPE_PPG
        ? 'PPG (0x01)'
        : measurementType === PMD_TYPE_ECG
        ? 'ECG (0x00)'
        : `Type 0x${measurementType.toString(16)}`;

    const opLabel =
      opcode === PMD_OP_GET_SETTINGS
        ? 'GetSettings (0x01)'
        : opcode === PMD_OP_START_MEASUREMENT
        ? 'StartMeasurement (0x02)'
        : opcode === PMD_OP_STOP_MEASUREMENT
        ? 'StopMeasurement (0x03)'
        : `Opcode 0x${opcode.toString(16)}`;

    this.lastPmdResponse = `${opLabel} -> ${typeLabel} -> ${statusMsg}`;
    this.streamDebug.lastControlTimestamp = Date.now();
    this.streamDebug.lastControlHex = Array.from(new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength))
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    console.log(`[BLE PMD Response] ${this.lastPmdResponse}`);
    this.logStreamEvent(
      status === 0x00 ? 'CTRL' : 'WARN',
      `PMD Control: ${this.lastPmdResponse}`,
      dataView,
      'PMD_CTRL'
    );

    const ctrlRawBytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    this.rawPacketCounter += 1;
    const ctrlRecord: RawPacketRecord = {
      id: this.rawPacketCounter,
      timestamp: Date.now(),
      timeFormatted: new Date().toISOString(),
      intervalDeltaMs: null,
      byteLength: ctrlRawBytes.length,
      hex: Array.from(ctrlRawBytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
      bytes: Array.from(ctrlRawBytes),
      ascii: Array.from(ctrlRawBytes).map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·')).join(''),
      characteristic: 'PMD_CTRL_FB005C81',
      parsedSummary: this.lastPmdResponse,
    };
    this.rawPackets.push(ctrlRecord);
    if (this.rawPackets.length > 1000) {
      this.rawPackets.shift();
    }
    this.streamDebug.rawPacketHistory = this.rawPackets;

    // Dispatch GetSettings response to pending Promise resolver
    if (opcode === PMD_OP_GET_SETTINGS) {
      const resolver = this.pendingSettingsResolvers.get(measurementType);
      if (resolver) {
        if (status === 0x00) {
          const settings = parsePmdSettingsPayload(dataView, 4);
          resolver.resolve(settings);
        } else {
          resolver.reject(new Error(`Settings request rejected: ${statusMsg}`));
        }
      }
    }

    // Dispatch StartMeasurement response to pending Promise resolver
    if (opcode === PMD_OP_START_MEASUREMENT) {
      const resolver = this.pendingStartResolvers.get(measurementType);
      if (resolver) {
        // Resolve with status code number directly
        resolver.resolve(status);
      }
    }

    // Dispatch StopMeasurement response to pending Promise resolver
    if (opcode === PMD_OP_STOP_MEASUREMENT) {
      const resolver = this.pendingStopResolvers.get(measurementType);
      if (resolver) {
        resolver.resolve(status);
      }
    }

    this.notifyDeviceInfo();
  }

  /**
   * Parses streaming Polar PMD Data characteristic packets (GYRO or ACC)
   * Handles:
   * - Type 0x00: Raw uncompressed 16-bit signed triplets
   * - Type 0x80+: Delta-compressed frames with reference sample and bit-packed deltas
   */
  private handlePmdData(dataView: DataView) {
    const now = Date.now();
    this.packetsReceived += 1;
    this.streamDebug.totalPacketsRead += 1;
    this.streamDebug.totalBytesRead += dataView.byteLength;
    this.streamDebug.lastPacketTimestamp = now;
    this.streamDebug.lastPacketByteLength = dataView.byteLength;

    const rawBytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const slice = rawBytes.slice(0, 32);
    this.streamDebug.lastPacketHex =
      Array.from(slice)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ') + (rawBytes.length > 32 ? ` ...(+${rawBytes.length - 32}B)` : '');
    this.streamDebug.lastPacketAscii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·'))
      .join('');

    // Record complete raw packet trace
    const prevDataPacket = this.rawPackets.length > 0 ? this.rawPackets[this.rawPackets.length - 1] : null;
    const deltaMs = prevDataPacket ? Math.max(0, now - prevDataPacket.timestamp) : null;
    const fullHex = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const fullAscii = Array.from(rawBytes).map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·')).join('');

    this.rawPacketCounter += 1;
    const packetRecord: RawPacketRecord = {
      id: this.rawPacketCounter,
      timestamp: now,
      timeFormatted: new Date(now).toISOString(),
      intervalDeltaMs: deltaMs,
      byteLength: rawBytes.length,
      hex: fullHex,
      bytes: Array.from(rawBytes),
      ascii: fullAscii,
      characteristic: 'PMD_DATA_FB005C82',
    };
    this.rawPackets.push(packetRecord);
    if (this.rawPackets.length > 1000) {
      this.rawPackets.shift();
    }
    this.streamDebug.rawPacketHistory = this.rawPackets;

    if (dataView.byteLength < 10) {
      this.logStreamEvent(
        'WARN',
        `Short PMD packet (${dataView.byteLength} B): ${this.streamDebug.lastPacketHex}`,
        dataView,
        'PMD_DATA'
      );
      this.notifyDeviceInfo();
      return;
    }

    try {
      // Polar PMD frame format:
      // Byte 0: Type (0x05 = GYRO, 0x02 = ACC)
      // Bytes 1..8: Timestamp (uint64 nanoseconds)
      // Byte 9: Frame type (0 = standard raw 16-bit triplets; >= 0x80 = delta compressed)
      const type = dataView.getUint8(0);
      const frameType = dataView.getUint8(9);

      const parsedSamples: {
        x: number;
        y: number;
        z: number;
        magnitude: number;
        sensorType: 'GYRO' | 'ACC';
        rawX?: number;
        rawY?: number;
        rawZ?: number;
      }[] = [];

      if (type === PMD_TYPE_GYRO) {
        this.activeStreamType = 'GYRO';
        this.currentDeviceInfo.hasGyroscope = true;

        if (frameType === 0x00) {
          // Uncompressed 16-bit signed integers (dps / 10.0 or 1.0)
          for (let offset = 10; offset + 6 <= dataView.byteLength; offset += 6) {
            const rawX = dataView.getInt16(offset, true) / 10.0;
            const rawY = dataView.getInt16(offset + 2, true) / 10.0;
            const rawZ = dataView.getInt16(offset + 4, true) / 10.0;
            const magnitude = Math.sqrt(rawX * rawX + rawY * rawY + rawZ * rawZ);
            parsedSamples.push({ x: rawX, y: rawY, z: rawZ, magnitude, sensorType: 'GYRO' });
          }
        } else if (dataView.byteLength >= 16) {
          // Delta frame: reference sample at 10..15
          const refX = dataView.getInt16(10, true) / 10.0;
          const refY = dataView.getInt16(12, true) / 10.0;
          const refZ = dataView.getInt16(14, true) / 10.0;
          const magnitude = Math.sqrt(refX * refX + refY * refY + refZ * refZ);
          parsedSamples.push({ x: refX, y: refY, z: refZ, magnitude, sensorType: 'GYRO' });
        }
      } else if (type === PMD_TYPE_ACC) {
        this.activeStreamType = 'ACC';
        this.currentDeviceInfo.hasAccelerometer = true;

        // Refresh keep-alive watchdog on every single motion data notification from Polar hardware
        this.onKeepAliveCallbacks.forEach((cb) => cb(now));

        // Polar ACC raw values parsing:
        // Handles:
        // - Frame 0x00: Raw uncompressed 16-bit signed triplets
        // - Frame 0x81: Frame Type 1 Delta Compressed (8-bit signed reference sample + bit deltas, seen on Polar Loop 2)
        // - Frame 0x80: Frame Type 0 Delta Compressed (16-bit signed reference sample + bit deltas)
        // - Frame 0x01: Raw uncompressed 8-bit signed triplets
        if (frameType === 0x00) {
          // Uncompressed 16-bit signed triplets
          for (let offset = 10; offset + 6 <= dataView.byteLength; offset += 6) {
            const rawX = dataView.getInt16(offset, true) / 1000.0;
            const rawY = dataView.getInt16(offset + 2, true) / 1000.0;
            const rawZ = dataView.getInt16(offset + 4, true) / 1000.0;
            const magnitude = Math.sqrt(rawX * rawX + rawY * rawY + rawZ * rawZ);
            parsedSamples.push({ x: rawX, y: rawY, z: rawZ, magnitude, sensorType: 'ACC' });
          }
        } else if (frameType >= 0x80 && dataView.byteLength >= 16) {
          // Delta-compressed frame with 16-bit reference samples for X, Y, Z (0x80 or 0x81, e.g. Polar Loop 2, H10)
          const beX = dataView.getInt16(10, false);
          const beY = dataView.getInt16(12, false);
          const beZ = dataView.getInt16(14, false);
          const leX = dataView.getInt16(10, true);
          const leY = dataView.getInt16(12, true);
          const leZ = dataView.getInt16(14, true);

          // Polar Loop 2 transmits 16-bit Big-Endian (0x03FF = +1023 mG = 1.023 G gravity baseline).
          // In Little-Endian 0x03FF is parsed as 0xFF03 = -253 mG.
          // Detect Big-Endian by checking high byte (0x03, 0x00, 0xFC, 0xFF) and physical plausibility.
          const byte10 = dataView.getUint8(10);
          const isBigEndian =
            (byte10 === 0x03 || byte10 === 0x02 || byte10 === 0x01 || byte10 === 0x00 || byte10 === 0xfc || byte10 === 0xfe) &&
            Math.abs(beX) <= 16000 &&
            Math.abs(beY) <= 16000 &&
            Math.abs(beZ) <= 16000;

          let currX = isBigEndian ? beX : leX;
          let currY = isBigEndian ? beY : leY;
          let currZ = isBigEndian ? beZ : leZ;

          parsedSamples.push({
            x: currX / 1000.0,
            y: currY / 1000.0,
            z: currZ / 1000.0,
            magnitude: Math.sqrt(currX * currX + currY * currY + currZ * currZ) / 1000.0,
            sensorType: 'ACC',
            rawX: currX,
            rawY: currY,
            rawZ: currZ,
          });

          // Unpack bit deltas if available (byteLength > 16)
          if (dataView.byteLength > 16) {
            const deltaBits = dataView.getUint8(16);
            if (deltaBits > 0 && deltaBits <= 16) {
              let bitPos = 0;
              const startByte = 17;
              const totalBits = (dataView.byteLength - startByte) * 8;

              const readSignedBits = (bits: number): number => {
                let val = 0;
                for (let b = 0; b < bits; b++) {
                  const totalBitIndex = bitPos + b;
                  const byteIdx = startByte + Math.floor(totalBitIndex / 8);
                  if (byteIdx >= dataView.byteLength) return 0;
                  const bitInByte = totalBitIndex % 8;
                  const bitVal = (dataView.getUint8(byteIdx) >> bitInByte) & 1;
                  val |= bitVal << b;
                }
                bitPos += bits;
                if (val & (1 << (bits - 1))) {
                  val -= 1 << bits;
                }
                return val;
              };

              while (bitPos + deltaBits * 3 <= totalBits) {
                const dx = readSignedBits(deltaBits);
                const dy = readSignedBits(deltaBits);
                const dz = readSignedBits(deltaBits);

                currX += dx;
                currY += dy;
                currZ += dz;

                const sx = currX / 1000.0;
                const sy = currY / 1000.0;
                const sz = currZ / 1000.0;
                parsedSamples.push({
                  x: sx,
                  y: sy,
                  z: sz,
                  magnitude: Math.sqrt(sx * sx + sy * sy + sz * sz),
                  sensorType: 'ACC',
                  rawX: currX,
                  rawY: currY,
                  rawZ: currZ,
                });
              }
            }
          }
        } else if (frameType >= 0x80 && dataView.byteLength >= 14) {
          // 14-byte Polar Loop 2 frame (Type 0x81):
          // Structure: [02] [8-byte uint64 timestamp] [81] [Axis 1: 16-bit BE] [Axis 2: 16-bit BE]
          // Example: 02 0E 7E 56 05 F4 6E C2 0B 81 03 FF 03 3F
          //   0x03FF = 1023 mG (1.023 G - Earth gravity vector)
          //   0x033F = 831 mG (0.831 G - dynamic movement axis)
          const raw1 = dataView.getInt16(10, false); // Big-Endian 16-bit
          const raw2 = dataView.getInt16(12, false); // Big-Endian 16-bit

          const g1 = raw1 / 1000.0;
          const g2 = raw2 / 1000.0;
          // In 2-axis planar readings, compute planar magnitude and estimate Z from 1G gravity constraint if applicable
          const mag = Math.sqrt(g1 * g1 + g2 * g2);

          parsedSamples.push({
            x: g1,
            y: g2,
            z: 0.0,
            magnitude: mag,
            sensorType: 'ACC',
            rawX: raw1,
            rawY: raw2,
            rawZ: 0,
          });
        } else if (frameType >= 0x80 && dataView.byteLength < 14) {
          // Truncated fallback frame (<14 bytes)
          const raw1 = dataView.getInt8(10);
          const raw2 = dataView.byteLength >= 12 ? dataView.getInt8(11) : 0;
          const sx = (raw1 * 16) / 1000.0;
          const sy = (raw2 * 16) / 1000.0;
          parsedSamples.push({
            x: sx,
            y: sy,
            z: 0.0,
            magnitude: Math.sqrt(sx * sx + sy * sy),
            sensorType: 'ACC',
            rawX: raw1,
            rawY: raw2,
            rawZ: 0,
          });
        } else if (frameType === 0x01) {
          // 8-bit signed raw format
          for (let offset = 10; offset + 3 <= dataView.byteLength; offset += 3) {
            const rawX = dataView.getInt8(offset);
            const rawY = dataView.getInt8(offset + 1);
            const rawZ = dataView.getInt8(offset + 2);
            const sx = (rawX * 16) / 1000.0;
            const sy = (rawY * 16) / 1000.0;
            const sz = (rawZ * 16) / 1000.0;
            const magnitude = Math.sqrt(sx * sx + sy * sy + sz * sz);
            parsedSamples.push({ x: sx, y: sy, z: sz, magnitude, sensorType: 'ACC', rawX, rawY, rawZ });
          }
        } else if (dataView.byteLength >= 13) {
          // Fallback parser for any custom frame format: extract bytes 10..12 as 8-bit signed
          const rawX = dataView.getInt8(10);
          const rawY = dataView.getInt8(11);
          const rawZ = dataView.getInt8(12);
          const sx = rawX / 16.0;
          const sy = rawY / 16.0;
          const sz = rawZ / 16.0;
          const magnitude = Math.sqrt(sx * sx + sy * sy + sz * sz);
          parsedSamples.push({ x: sx, y: sy, z: sz, magnitude, sensorType: 'ACC', rawX, rawY, rawZ });
        }
      } else {
        this.logStreamEvent(
          'WARN',
          `Unknown PMD measurement type 0x${type.toString(16)} (frame 0x${frameType.toString(16)})`,
          dataView,
          'PMD_DATA'
        );
      }

      if (parsedSamples.length > 0) {
        const numSamples = parsedSamples.length;
        this.totalSamplesCaptured += numSamples;
        this.streamDebug.totalSamplesCaptured = this.totalSamplesCaptured;
        this.streamDebug.lastPacketSamplesCount = numSamples;

        // Auto-initialize action if none is currently active
        if (!this.currentAction) {
          this.startAction(
            this.activeStreamType === 'GYRO' ? 'Gyroscope Stream' : 'Accelerometer Stream'
          );
        }

        if (this.currentAction) {
          this.currentAction.samplesCaptured += numSamples;
          this.currentAction.packetsReceived += 1;
          this.currentAction.lastPacketTimestamp = now;
          this.currentAction.durationSeconds = Math.max(0, (now - this.currentAction.startTime) / 1000);
          this.currentAction.averageSamplesPerPacket =
            this.currentAction.packetsReceived > 0
              ? Math.round((this.currentAction.samplesCaptured / this.currentAction.packetsReceived) * 10) / 10
              : numSamples;
        }

        // Monotonically distribute timestamps across samples in packet
        const sampleRate = this.configuredSampleRate || 25;
        const intervalMs = 1000.0 / sampleRate;
        const n = parsedSamples.length;

        parsedSamples.forEach((item, idx) => {
          const sampleTimestamp = now - Math.round((n - 1 - idx) * intervalMs);
          const sample: SensorSample = {
            timestamp: sampleTimestamp,
            x: item.x,
            y: item.y,
            z: item.z,
            magnitude: item.magnitude,
            sensorType: item.sensorType,
            hr: this.currentHr,
            rawX: item.rawX,
            rawY: item.rawY,
            rawZ: item.rawZ,
            rawHex: this.streamDebug.lastPacketHex,
            packetNumber: this.packetsReceived,
            frameType,
            samplesInPacket: numSamples,
            actionName: this.currentAction?.actionName || (this.activeStreamType === 'GYRO' ? 'Gyroscope' : 'Accelerometer'),
            actionSampleIndex: this.currentAction ? this.currentAction.samplesCaptured - (numSamples - 1 - idx) : this.totalSamplesCaptured,
          };
          this.onSampleCallbacks.forEach((cb) => cb(sample));
        });

        // Keep alive signal on motion packet
        this.onKeepAliveCallbacks.forEach((cb) => cb(now));

        this.logStreamEvent(
          'DATA',
          `Stream [${this.currentAction?.actionName || 'ACC'}]: ${parsedSamples.length} sample(s) in packet #${this.packetsReceived} (Action total: ${this.currentAction?.samplesCaptured || this.totalSamplesCaptured}) | [${parsedSamples[parsedSamples.length - 1].x.toFixed(3)}, ${parsedSamples[parsedSamples.length - 1].y.toFixed(3)}, ${parsedSamples[parsedSamples.length - 1].z.toFixed(3)}] G`,
          dataView,
          'PMD_DATA'
        );
        this.notifyDeviceInfo();
      } else {
        this.logStreamEvent(
          'INFO',
          `Packet ${this.packetsReceived}: ${dataView.byteLength} B received (0 motion samples decoded)`,
          dataView,
          'PMD_DATA'
        );
      }

      // Live UI packet notification
      if (this.packetsReceived === 1 || this.packetsReceived % 3 === 0) {
        this.notifyDeviceInfo();
      }
    } catch (err) {
      console.error('[BLE] Error parsing PMD packet:', err);
      this.logStreamEvent(
        'ERR',
        `Parse error: ${err instanceof Error ? err.message : String(err)}`,
        dataView,
        'PMD_DATA'
      );
      this.notifyDeviceInfo();
    }
  }

  async sendCustomControlHex(hexString: string): Promise<string> {
    if (!this.pmdControlChar) {
      throw new Error('PMD Control characteristic is not connected');
    }
    const cleanHex = hexString.replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) {
      throw new Error('Please enter a valid hex string with an even number of characters (e.g. "02 02")');
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    this.startAction(`Custom Command (${cleanHex.toUpperCase()})`, cleanHex.toUpperCase());
    this.logStreamEvent(
      'CTRL',
      `User TX (${bytes.length} B): ${cleanHex.toUpperCase()}`,
      undefined,
      'USER_TX'
    );
    await this.writeControlPoint(bytes);
    this.notifyDeviceInfo();
    return `Sent ${bytes.length} bytes: ${cleanHex.toUpperCase()}`;
  }

  async readCharacteristicDirectly(type: 'DATA' | 'CTRL' | 'BATTERY'): Promise<{ hex: string; length: number; ascii: string }> {
    let char = this.pmdDataChar;
    if (type === 'CTRL') char = this.pmdControlChar;
    if (type === 'BATTERY') char = this.batteryChar;
    if (!char) throw new Error(`Characteristic ${type} is not available on device`);
    const val: DataView = await char.readValue();
    const bytes = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    const ascii = Array.from(bytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '·'))
      .join('');
    this.logStreamEvent(
      'INFO',
      `Direct read ${type} (${bytes.length} B): ${hex}`,
      val,
      'DIRECT_READ'
    );
    this.notifyDeviceInfo();
    return { hex, length: bytes.length, ascii };
  }

  clearStreamDebugLogs(): void {
    this.streamDebug.recentEvents = [];
    this.notifyDeviceInfo();
  }

  getRawPackets(): RawPacketRecord[] {
    return [...this.rawPackets];
  }

  downloadRawPacketsJson(): void {
    const data = {
      device: {
        id: this.currentDeviceInfo.id,
        name: this.currentDeviceInfo.name,
        activeStreamType: this.activeStreamType,
        sampleRate: this.configuredSampleRate,
        range: this.configuredRange,
        lastPmdResponse: this.lastPmdResponse,
        battery: this.currentDeviceInfo.batteryLevel,
      },
      exportTimestamp: new Date().toISOString(),
      totalPacketsCaptured: this.rawPackets.length,
      packets: this.rawPackets,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polar_raw_packets_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadRawBinaryStream(): void {
    const totalBytes = this.rawPackets.reduce((sum, p) => sum + p.bytes.length, 0);
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const p of this.rawPackets) {
      combined.set(p.bytes, offset);
      offset += p.bytes.length;
    }
    const blob = new Blob([combined], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polar_raw_stream_${Date.now()}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadRawPacketsCsv(): void {
    if (this.rawPackets.length === 0) return;
    const maxBytes = Math.max(...this.rawPackets.map((p) => p.bytes.length), 14);
    const byteHeaders = Array.from({ length: maxBytes }, (_, i) => `byte_${i}_hex`).join(',');

    let csv = `index,timestamp_iso,timestamp_ms,interval_delta_ms,characteristic,byte_length,raw_hex,ascii,parsed_summary,${byteHeaders}\n`;
    for (const p of this.rawPackets) {
      const rowBytes = Array.from({ length: maxBytes }, (_, i) =>
        i < p.bytes.length ? p.bytes[i].toString(16).padStart(2, '0').toUpperCase() : ''
      ).join(',');
      csv += `${p.id},"${p.timeFormatted}",${p.timestamp},${p.intervalDeltaMs ?? 0},"${p.characteristic}",${p.byteLength},"${p.hex}","${p.ascii}","${p.parsedSummary || ''}",${rowBytes}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polar_raw_packets_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  copyRawPacketsHex(): string {
    const text = this.rawPackets
      .map((p) => `[${p.timeFormatted}] (${p.characteristic}, ${p.byteLength}B, \u0394t=${p.intervalDeltaMs ?? 0}ms): ${p.hex}`)
      .join('\n');
    navigator.clipboard?.writeText(text);
    return text;
  }

  clearRawPackets(): void {
    this.rawPackets = [];
    this.streamDebug.rawPacketHistory = [];
    this.notifyDeviceInfo();
  }

  /**
   * Kickstarts or re-triggers stream if paused, stalled, or on user demand.
   * Strictly executes STOP [03 02] -> wait 350ms -> START to clear ERROR_ALREADY_IN_STATE.
   */
  async kickstartStream(customStartCmd?: Uint8Array): Promise<string> {
    if (!this.pmdControlChar) {
      throw new Error('PMD Control characteristic is not available');
    }
    const hex = customStartCmd
      ? Array.from(customStartCmd).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      : '02 02';
    this.startAction(`Kickstart [${hex}]`, hex);
    this.logStreamEvent('INFO', 'Kickstarting stream: sending STOP [03 02] to clear state, then START...', undefined, 'KICKSTART');

    // 1. First, drain FIFO if a packet is waiting
    if (this.pmdDataChar) {
      try {
        const val = await this.pmdDataChar.readValue();
        if (val && val.byteLength > 0) {
          this.handlePmdData(val);
        }
      } catch (_) {}
    }

    // 2. Polar BLE SDK requirement: send STOP command first to guarantee IDLE state
    console.log('[BLE] Kickstart: resetting state with STOP [03 02]...');
    await this.sendStopCommandAndWait(PMD_TYPE_ACC, 800);
    await new Promise((r) => setTimeout(r, 350));

    // 3. Try target command or Minimal [02 02]
    const cmd = customStartCmd || new Uint8Array([PMD_OP_START_MEASUREMENT, PMD_TYPE_ACC]);
    const status = await this.sendStartCommandAndWait(PMD_TYPE_ACC, cmd);

    if (status === 0x00 || status === 0x06) {
      this.activeStreamType = 'ACC';
      this.currentDeviceInfo.hasAccelerometer = true;
      this.setStatus('STREAMING');
      this.notifyDeviceInfo();
      return `Stream started successfully! Status: ${PMD_STATUS_MAP[status] || status}`;
    }

    // 4. If minimal command rejected with INVALID_PARAMETER (0x05), try 25Hz 16-bit 8G
    console.log('[BLE] Minimal command returned status', status, '- falling back to 25Hz 16-bit 8G...');
    this.logStreamEvent('INFO', 'Minimal start rejected, falling back to 25Hz 16-bit 8G command...', undefined, 'KICKSTART');
    const stdCmd = new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]);
    const fallbackStatus = await this.sendStartCommandAndWait(PMD_TYPE_ACC, stdCmd);

    this.activeStreamType = 'ACC';
    this.currentDeviceInfo.hasAccelerometer = true;
    this.setStatus('STREAMING');
    this.notifyDeviceInfo();
    return `Stream started with 25Hz 16-bit! Status: ${PMD_STATUS_MAP[fallbackStatus] || fallbackStatus}`;
  }

  /**
   * Attempts to transition device from 8-second periodic epoch mode into continuous 25Hz streaming.
   * Sends STOP [03 02] -> SDK Mode [02 09] -> Range-First ACC 25Hz TLV -> Rate-First ACC TLV.
   */
  async unlock25HzStream(): Promise<string> {
    if (!this.pmdControlChar) {
      throw new Error('PMD Control characteristic is not connected');
    }
    this.startAction('Unlock 25Hz Stream', '02 02 02 01 08 00 00 01 19 00 01 01 10 00');
    this.logStreamEvent('INFO', 'Attempting 25Hz continuous stream unlock sequence...', undefined, 'PMD_CTRL');

    // 1. Reset state with STOP [03 02]
    await this.sendStopCommandAndWait(PMD_TYPE_ACC, 600);
    await new Promise((r) => setTimeout(r, 300));

    // 2. Try SDK Mode enable [02 09]
    try {
      this.logStreamEvent('INFO', 'Sending SDK Mode enable [02 09] to unlock continuous streaming...', undefined, 'PMD_CTRL');
      await this.sendStartCommandAndWait(0x09, new Uint8Array([0x02, 0x09]));
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // SDK mode may not be supported on this hardware; continue to ACC commands
    }

    // 3. Try Range-First 25Hz 16-bit 8G
    const rangeFirstCmd = new Uint8Array([0x02, 0x02, 0x02, 0x01, 0x08, 0x00, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00]);
    this.logStreamEvent('INFO', 'Sending Range-First ACC 25Hz command...', undefined, 'PMD_CTRL');
    const status1 = await this.sendStartCommandAndWait(PMD_TYPE_ACC, rangeFirstCmd);
    if (status1 === 0x00) {
      this.configuredSampleRate = 25;
      this.configuredRange = 8;
      this.activeStreamType = 'ACC';
      this.setStatus('STREAMING');
      this.notifyDeviceInfo();
      return 'Continuous 25Hz stream unlocked! (SUCCESS 0x00)';
    }

    // 4. Try Rate-First 25Hz 16-bit 8G
    const rateFirstCmd = new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]);
    const status2 = await this.sendStartCommandAndWait(PMD_TYPE_ACC, rateFirstCmd);
    if (status2 === 0x00) {
      this.configuredSampleRate = 25;
      this.configuredRange = 8;
      this.activeStreamType = 'ACC';
      this.setStatus('STREAMING');
      this.notifyDeviceInfo();
      return 'Continuous 25Hz stream started! (SUCCESS 0x00)';
    }

    // 5. Try 25Hz 8-bit
    const rate8bit = new Uint8Array([0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x08, 0x00, 0x02, 0x01, 0x08, 0x00]);
    const status3 = await this.sendStartCommandAndWait(PMD_TYPE_ACC, rate8bit);
    if (status3 === 0x00) {
      this.configuredSampleRate = 25;
      this.configuredRange = 8;
      this.activeStreamType = 'ACC';
      this.setStatus('STREAMING');
      this.notifyDeviceInfo();
      return '25Hz 8-bit stream started! (SUCCESS 0x00)';
    }

    return `Polar Loop 2 hardware returned status 0x${status1.toString(16)}. Device is active in 8-second Activity Epoch mode with inter-epoch motion detection.`;
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    // Immediate initial keep-alive signal
    this.onKeepAliveCallbacks.forEach((cb) => cb(Date.now()));

    this.keepAliveTimer = window.setInterval(async () => {
      if (!this.device?.gatt?.connected) {
        this.setStatus('DISCONNECTED');
        this.stopKeepAlive();
        return;
      }

      const now = Date.now();

      // Keep alive signal MUST ALWAYS be emitted as long as GATT remains connected
      // to keep Dead Man's Watchdog satisfied
      this.onKeepAliveCallbacks.forEach((cb) => cb(now));

      // Automatic Stream Stall Watchdog:
      // If we are supposed to be streaming ACC, but haven't received a PMD Data packet in > 7.0 seconds
      if (this.activeStreamType !== 'NONE' && this.streamDebug.lastPacketTimestamp) {
        const elapsedSec = (now - this.streamDebug.lastPacketTimestamp) / 1000.0;
        if (elapsedSec > 7.0 && elapsedSec < 60.0) {
          console.warn(`[BLE Watchdog] Stream appears stalled (${elapsedSec.toFixed(1)}s since last packet). Auto kickstarting...`);
          this.logStreamEvent('WARN', `Auto-kickstart: stream idle for ${elapsedSec.toFixed(1)}s`, undefined, 'STREAM_WATCHDOG');
          try {
            await this.kickstartStream();
          } catch (e) {
            console.warn('[BLE Watchdog] Kickstart attempt failed:', e);
          }
        }
      }
    }, 2000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  disconnect() {
    this.stopKeepAlive();
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.setStatus('DISCONNECTED');
    this.device = null;
    this.server = null;
    this.batteryChar = null;
    this.pmdControlChar = null;
    this.pmdDataChar = null;
    this.activeStreamType = 'NONE';
    this.pendingSettingsResolvers.clear();
    this.pendingStartResolvers.clear();
    this.notifyDeviceInfo();
  }
}

export const bluetooth = new BluetoothService();
