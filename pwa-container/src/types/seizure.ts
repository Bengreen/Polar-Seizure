/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SensorSample {
  timestamp: number;
  x: number; // m/s² or Gs (ACC) or deg/s (GYRO)
  y: number;
  z: number;
  magnitude: number;
  sensorType?: 'GYRO' | 'ACC';
  hr?: number; // Heart rate in BPM if available from Polar
  rawX?: number; // Raw integer from packet (e.g. -253)
  rawY?: number;
  rawZ?: number;
  rawHex?: string; // Hex snippet of raw packet
  packetNumber?: number; // Monotonic packet counter
  frameType?: number;
  samplesInPacket?: number; // Number of samples extracted from this single packet
  actionName?: string; // Name of stream or action (e.g. 'Kickstart [02 02]', 'Unlock 25Hz', 'Continuous 25Hz')
  actionSampleIndex?: number; // Running count of samples captured within current stream or action
}

export interface SpectrumAnalysis {
  frequencies: number[]; // Frequency bins up to Nyquist (12.5 Hz at 25 Hz sampling)
  powers: number[];      // Power spectrum density
  roiPower: number;      // Total power in 3.0 Hz - 8.0 Hz band
  totalPower: number;    // Total power across spectrum
  ratio: number;         // roiPower / totalPower (0.0 to 1.0)
  peakFrequency: number; // Frequency with peak power in ROI
  isSeizureCandidate: boolean; // ROI power & ratio exceed thresholds
}

export type DetectorState =
  | 'IDLE'                 // Not actively streaming or monitoring
  | 'MONITORING_SAFE'     // Normal activity, baseline safe
  | 'WARNING'             // Potential clonic movement detected (10s cancellation countdown)
  | 'ALARM'               // Confirmed seizure episode: loud siren + carer SMS/push
  | 'FAULT_DISCONNECTED'  // Dead man's handle triggered: BLE stream lost > 30s
  | 'FAULT_BATTERY';      // Critical battery warning on wearable or phone (< 15%)

export interface DetectionConfig {
  sampleRate: number;              // 25 Hz (standard OpenSeizureDetector rate)
  windowSize: number;              // 128 samples (~5.12s window for 0.195 Hz FFT resolution)
  roiMinFreq: number;              // 3.0 Hz
  roiMaxFreq: number;              // 8.0 Hz
  roiPowerThreshold: number;       // Minimum movement intensity required
  ratioThreshold: number;          // Minimum 3-8Hz power fraction (typically 0.50 - 0.65)
  warningDurationSeconds: number;  // Time tremor must persist before alarm (e.g. 5s)
  alarmGraceSeconds: number;       // Window for user to tap "I am OK" (default 10s)
  deadmanTimeoutSeconds: number;   // Max seconds without packet before carer alert (default 30s)
  minBatteryThreshold: number;     // Critical battery % threshold (default 15%)
  highPassCutoff: boolean;         // Remove static 1G gravity vector
}

export interface CarerContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

export interface CarerSettings {
  contacts: CarerContact[];
  enableSms: boolean;
  enablePush: boolean;
  enableSiren: boolean;
  sirenVolume: number; // 0 to 1
  sirenProfile?: 'WAIL' | 'HILO' | 'STROBE'; // Sound profile for attention-drawing
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  customWebhookUrl: string; // Alternative webhook (e.g., Home Assistant, Pushover, Make, Zapier)
  alarmMessageTemplate: string;
}

export interface HealthWatchdog {
  lastPacketTimestamp: number;
  packetAgeSeconds: number;
  isBleConnected: boolean;
  deviceName: string | null;
  deviceBatteryLevel: number | null; // Wearable battery %
  phoneBatteryLevel: number | null;  // Android phone battery %
  isPhoneCharging: boolean | null;
  isWakeLockActive: boolean;
  isDeadmanBreached: boolean;
  diagnosticStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL_FAULT';
  statusMessage: string;
}

export interface AlarmEvent {
  id: string;
  timestamp: number;
  type: 'SEIZURE_ALARM' | 'DEADMAN_FAULT' | 'CANCELLED_SAFE';
  durationSeconds: number;
  peakRatio: number;
  peakPower: number;
  carersNotified: string[];
  resolvedAt?: number;
}

export interface BatteryHistoryPoint {
  timestamp: number;
  timeStr: string;
  phoneBattery: number;
  wearableBattery: number;
  isPhoneCharging?: boolean;
}
