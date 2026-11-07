/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlarmEvent,
  CarerSettings,
  DetectionConfig,
  DetectorState,
  HealthWatchdog,
  SensorSample,
  SpectrumAnalysis,
  BatteryHistoryPoint,
} from './types/seizure';
import { analyzeAccelerometerWindow } from './services/fft';
import {
  bluetooth,
  BluetoothDeviceInfo,
  BluetoothPermissionsPolicyError,
  BluetoothConnectionAttemptFailedError,
  isRunningInIframe,
} from './services/bluetooth';
import { signalSimulator, SimulatorScenario } from './services/simulator';
import { audioAlarm } from './services/audioAlarm';
import { carerAlerts, DispatchResult } from './services/carerAlerts';
import { deadmanWatchdog } from './services/deadmanWatchdog';
import { backendSync, CloudWatchdogStatus } from './services/backendSync';
import { Header } from './components/Header';
import { TelemetryDisplay } from './components/TelemetryDisplay';
import { SpectrumVisualizer } from './components/SpectrumVisualizer';
import { DeadmanCard } from './components/DeadmanCard';
import { BatteryDrainChart } from './components/BatteryDrainChart';
import { CloudWatchdogCard } from './components/CloudWatchdogCard';
import { AlarmModal } from './components/AlarmModal';
import { SettingsModal } from './components/SettingsModal';
import { GitSyncModal } from './components/GitSyncModal';
import { BluetoothPermissionsModal } from './components/BluetoothPermissionsModal';
import { OpenSeizureDetectorInfo } from './components/OpenSeizureDetectorInfo';
import { PolarBleInspectorCard } from './components/PolarBleInspectorCard';
import { StreamDebugConsole } from './components/StreamDebugConsole';
import { MotionDataTable } from './components/MotionDataTable';
import {
  Activity,
  Bluetooth,
  Play,
  Square,
  AlertTriangle,
  Radio,
  Sliders,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
  ExternalLink,
  SlidersHorizontal,
  Compass,
  Zap,
} from 'lucide-react';

// Default configuration based on OpenSeizureDetector standards
const DEFAULT_CONFIG: DetectionConfig = {
  sampleRate: 25,
  windowSize: 128, // 128 samples / 25 Hz = 5.12s
  roiMinFreq: 3.0,
  roiMaxFreq: 8.0,
  roiPowerThreshold: 120.0,
  ratioThreshold: 0.55,
  warningDurationSeconds: 5,
  alarmGraceSeconds: 10,
  deadmanTimeoutSeconds: 30,
  minBatteryThreshold: 15,
  highPassCutoff: true,
};

const DEFAULT_CARER_SETTINGS: CarerSettings = {
  contacts: [
    {
      id: '1',
      name: 'Primary Carer (Sarah)',
      phone: '+447700900123',
      relationship: 'Partner / Family',
      isPrimary: true,
    },
  ],
  enableSms: true,
  enablePush: true,
  enableSiren: true,
  sirenVolume: 1.0, // 100% full volume for attention-drawing emergency siren
  sirenProfile: 'WAIL',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  customWebhookUrl: '',
  alarmMessageTemplate: 'EMERGENCY: OpenSeizureDetector alert for patient. {reason}',
};

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'monitor' | 'diagnostics' | 'about'>('monitor');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGitSyncOpen, setIsGitSyncOpen] = useState(false);

  // Core Detector State
  const [detectorState, setDetectorState] = useState<DetectorState>('IDLE');
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Loud Siren & Audio State
  const [isSirenPlaying, setIsSirenPlaying] = useState<boolean>(false);

  // OLED Night Blackout Mode (saves 60% battery during night sleep monitoring)
  const [isNightMode, setIsNightMode] = useState<boolean>(false);

  // End-to-End Cloud Dead Man's Watchdog Telemetry
  const [cloudStatus, setCloudStatus] = useState<CloudWatchdogStatus>(() => ({
    status: 'AWAITING_INITIAL_HEARTBEAT',
    serverTime: Date.now(),
    heartbeatAgeSeconds: null,
    cloudTimeoutSeconds: 45,
    cloudWatchdogHealthy: true,
    isCloudDeadmanBreached: false,
    isSyncing: false,
  }));
  const heartbeatTickRef = useRef<number>(0);

  // Sensor Buffer (Circular window of 128 samples)
  const [samples, setSamples] = useState<SensorSample[]>([]);
  const [currentSample, setCurrentSample] = useState<SensorSample | null>(null);
  const [spectrumAnalysis, setSpectrumAnalysis] = useState<SpectrumAnalysis | null>(null);

  // Settings & Configuration (saved in localStorage)
  const [config, setConfig] = useState<DetectionConfig>(() => {
    const saved = localStorage.getItem('osd_detection_config');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [carerSettings, setCarerSettings] = useState<CarerSettings>(() => {
    const saved = localStorage.getItem('osd_carer_settings');
    return saved ? JSON.parse(saved) : DEFAULT_CARER_SETTINGS;
  });

  // Bluetooth & Device State
  const [isBleConnected, setIsBleConnected] = useState(false);
  const [bleDevice, setBleDevice] = useState<BluetoothDeviceInfo | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const [isPermissionsPolicyModalOpen, setIsPermissionsPolicyModalOpen] = useState(false);
  const [isIframe] = useState(() => isRunningInIframe());

  // Simulator Scenario State
  const [isSimulatorMode, setIsSimulatorMode] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<SimulatorScenario>('REST');

  // Watchdog & Telemetry
  const [watchdog, setWatchdog] = useState<HealthWatchdog>(() =>
    deadmanWatchdog.evaluateHealth(false, null)
  );
  const [measuredSampleRate, setMeasuredSampleRate] = useState<number>(25.0);

  // Alarm & Grace Period State
  const [warningCountdown, setWarningCountdown] = useState<number>(10);
  const [seizureDuration, setSeizureDuration] = useState<number>(0);
  const [dispatchResults, setDispatchResults] = useState<DispatchResult[]>([]);

  // Battery History Telemetry
  const generateInitialBatteryHistory = (): BatteryHistoryPoint[] => {
    const points: BatteryHistoryPoint[] = [];
    const now = Date.now();
    for (let i = 10; i >= 0; i--) {
      const t = now - i * 3 * 60 * 1000;
      const date = new Date(t);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      points.push({
        timestamp: t,
        timeStr,
        phoneBattery: Math.max(15, Math.min(100, Math.round(94 - (10 - i) * 0.2))),
        wearableBattery: Math.max(15, Math.min(100, Math.round(90 - (10 - i) * 0.15))),
        isPhoneCharging: false,
      });
    }
    return points;
  };

  const [batteryHistory, setBatteryHistory] = useState<BatteryHistoryPoint[]>(generateInitialBatteryHistory);
  const batteryTickRef = useRef<number>(0);

  // Refs for tracking timestamps and rate calculation
  const sampleTimestampsRef = useRef<number[]>([]);
  const bufferRef = useRef<number[]>([]);
  const detectorStateRef = useRef<DetectorState>(detectorState);
  detectorStateRef.current = detectorState;

  const warningTimerRef = useRef<number | null>(null);
  const seizureStopwatchRef = useRef<number | null>(null);

  // Save settings when changed
  const handleSaveCarerSettings = (newSettings: CarerSettings) => {
    setCarerSettings(newSettings);
    localStorage.setItem('osd_carer_settings', JSON.stringify(newSettings));
  };

  const handleSaveDetectionConfig = (newConfig: DetectionConfig) => {
    setConfig(newConfig);
    localStorage.setItem('osd_detection_config', JSON.stringify(newConfig));
  };

  // Helper to trigger alert escalation
  const triggerEscalation = useCallback(
    async (targetState: DetectorState) => {
      setDetectorState(targetState);

      if (targetState === 'ALARM' && carerSettings.enableSiren) {
        audioAlarm.startSeizureSiren(carerSettings.sirenVolume || 1.0, carerSettings.sirenProfile || 'WAIL');
        backendSync.notifyServerSeizureAlert(
          `Tonic-Clonic Seizure Detected: 3-8 Hz power ratio ${((spectrumAnalysis?.ratio ?? 0.72) * 100).toFixed(0)}% at ${(spectrumAnalysis?.peakFrequency ?? 4.8).toFixed(1)} Hz`
        );
      } else if (
        (targetState === 'FAULT_DISCONNECTED' || targetState === 'FAULT_BATTERY') &&
        carerSettings.enableSiren
      ) {
        audioAlarm.playDeadmanAlert(carerSettings.sirenVolume || 0.9);
      }

      const results = await carerAlerts.dispatchFullEscalation(
        targetState,
        {
          patientName: 'Patient Monitor',
          peakRatio: spectrumAnalysis?.ratio ?? 0.72,
          peakFrequency: spectrumAnalysis?.peakFrequency ?? 4.8,
          deviceName: bleDevice?.name || (isSimulatorMode ? 'Signal Simulator' : 'Polar Loop Gen2'),
          batteryLevel: watchdog.deviceBatteryLevel ?? 88,
        },
        carerSettings
      );
      setDispatchResults(results);
    },
    [carerSettings, spectrumAnalysis, bleDevice, isSimulatorMode, watchdog.deviceBatteryLevel]
  );

  // Process incoming sensor sample (from BLE or Simulator)
  const handleIncomingSample = useCallback(
    (sample: SensorSample) => {
      setCurrentSample(sample);
      deadmanWatchdog.recordPacketReceived();

      // Track sample rate
      const now = sample.timestamp;
      sampleTimestampsRef.current.push(now);
      if (sampleTimestampsRef.current.length > 25) {
        sampleTimestampsRef.current.shift();
      }
      if (sampleTimestampsRef.current.length >= 2) {
        const count = sampleTimestampsRef.current.length - 1;
        const duration = (now - sampleTimestampsRef.current[0]) / 1000.0;
        if (duration > 0) {
          const rate = count / duration;
          setMeasuredSampleRate(Math.round(rate * 100) / 100);
        }
      }

      // Add to circular buffer
      setSamples((prev) => {
        const next = [...prev, sample];
        if (next.length > config.windowSize) {
          next.shift();
        }
        return next;
      });

      bufferRef.current.push(sample.magnitude);
      if (bufferRef.current.length > config.windowSize) {
        bufferRef.current.shift();
      }

      // Run FFT analysis when buffer is populated
      if (bufferRef.current.length >= config.windowSize) {
        const analysis = analyzeAccelerometerWindow(bufferRef.current, config);
        setSpectrumAnalysis(analysis);

        // Seizure candidate detection logic
        const currentState = detectorStateRef.current;

        if (analysis.isSeizureCandidate) {
          if (currentState === 'MONITORING_SAFE') {
            // Initiate Warning State
            setDetectorState('WARNING');
            setWarningCountdown(config.alarmGraceSeconds);
            if (carerSettings.enableSiren) {
              audioAlarm.playWarningBeep();
            }
            carerAlerts.triggerVibration('WARNING');
          }
        }
      }
    },
    [config, carerSettings.enableSiren]
  );

  // Setup BLE, Simulator, Audio, and Backend Sync subscriptions
  useEffect(() => {
    const unsubBle = bluetooth.onSample(handleIncomingSample);
    const unsubSim = signalSimulator.onSample(handleIncomingSample);

    // Keep dead man's handle active whenever BLE GATT keep-alive ping succeeds
    const unsubBleKeepAlive = bluetooth.onKeepAlive(() => {
      deadmanWatchdog.recordPacketReceived();
    });

    const unsubBleDevInfo = bluetooth.onDeviceInfo((info) => {
      setBleDevice(info);
      if (info.configuredSampleRate && info.configuredSampleRate !== config.sampleRate) {
        setConfig((prev) => ({ ...prev, sampleRate: info.configuredSampleRate || 25 }));
      }
    });

    const unsubBleBattery = bluetooth.onBatteryChange((batt) => {
      deadmanWatchdog.setDeviceBattery(batt);
    });
    const unsubSimBattery = signalSimulator.onBatteryChange((batt) => {
      deadmanWatchdog.setDeviceBattery(batt);
    });

    const unsubSiren = audioAlarm.onStateChange(setIsSirenPlaying);
    const unsubCloud = backendSync.onStatusChange(setCloudStatus);
    backendSync.fetchCloudStatus();

    return () => {
      unsubBle();
      unsubSim();
      unsubBleKeepAlive();
      unsubBleDevInfo();
      unsubBleBattery();
      unsubSimBattery();
      unsubSiren();
      unsubCloud();
    };
  }, [handleIncomingSample]);

  // Handle Warning Countdown Timer
  useEffect(() => {
    if (detectorState === 'WARNING') {
      warningTimerRef.current = window.setInterval(() => {
        setWarningCountdown((prev) => {
          if (prev <= 1) {
            // Escalation to full Alarm
            window.clearInterval(warningTimerRef.current!);
            triggerEscalation('ALARM');
            return 0;
          }
          if (carerSettings.enableSiren) {
            audioAlarm.playWarningBeep();
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (warningTimerRef.current) {
        window.clearInterval(warningTimerRef.current);
        warningTimerRef.current = null;
      }
    }

    return () => {
      if (warningTimerRef.current) {
        window.clearInterval(warningTimerRef.current);
      }
    };
  }, [detectorState, triggerEscalation, carerSettings.enableSiren]);

  // Handle Seizure Stopwatch Timer during ALARM
  useEffect(() => {
    if (detectorState === 'ALARM') {
      setSeizureDuration(0);
      seizureStopwatchRef.current = window.setInterval(() => {
        setSeizureDuration((sec) => sec + 1);
      }, 1000);
    } else {
      if (seizureStopwatchRef.current) {
        window.clearInterval(seizureStopwatchRef.current);
        seizureStopwatchRef.current = null;
      }
    }

    return () => {
      if (seizureStopwatchRef.current) {
        window.clearInterval(seizureStopwatchRef.current);
      }
    };
  }, [detectorState]);

  // Dead Man's Watchdog 1-Second Interval
  useEffect(() => {
    const interval = window.setInterval(() => {
      const devName = bleDevice?.name || (isSimulatorMode ? 'Signal Simulator' : null);
      const health = deadmanWatchdog.evaluateHealth(isBleConnected || isSimulatorMode, devName);
      setWatchdog(health);

      // Periodically record battery history snapshot (every 30 seconds)
      batteryTickRef.current += 1;
      if (batteryTickRef.current >= 30) {
        batteryTickRef.current = 0;
        const now = Date.now();
        const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setBatteryHistory((prev) => {
          const next = [
            ...prev,
            {
              timestamp: now,
              timeStr,
              phoneBattery: health.phoneBatteryLevel ?? 92,
              wearableBattery: health.deviceBatteryLevel ?? 88,
              isPhoneCharging: health.isPhoneCharging ?? false,
            },
          ];
          if (next.length > 60) next.shift();
          return next;
        });
      }

      // Stream status heartbeat to backend server every 10 seconds for end-to-end dead man tracking
      heartbeatTickRef.current += 1;
      if (heartbeatTickRef.current >= 10 && isMonitoring) {
        heartbeatTickRef.current = 0;
        backendSync.sendHeartbeat({
          detectorState: detectorStateRef.current,
          bleConnected: isBleConnected || isSimulatorMode,
          wearableBattery: health.deviceBatteryLevel ?? 88,
          phoneBattery: health.phoneBatteryLevel ?? 92,
          lastPacketAgeSeconds: health.packetAgeSeconds,
          peakRatio: spectrumAnalysis?.ratio ?? 0,
          peakFrequency: spectrumAnalysis?.peakFrequency ?? 0,
          carerContacts: carerSettings.contacts,
        });
      }

      // Check if dead man's timeout breached while active
      if (
        health.isDeadmanBreached &&
        detectorStateRef.current !== 'FAULT_DISCONNECTED' &&
        detectorStateRef.current !== 'ALARM'
      ) {
        triggerEscalation('FAULT_DISCONNECTED');
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [bleDevice, isSimulatorMode, isBleConnected, isMonitoring, carerSettings.contacts, spectrumAnalysis, triggerEscalation]);

  // Siren toggle and mute handlers
  const handleToggleSiren = () => {
    if (isSirenPlaying) {
      audioAlarm.stop();
    } else {
      audioAlarm.startSeizureSiren(carerSettings.sirenVolume || 1.0, carerSettings.sirenProfile || 'WAIL');
    }
  };

  const handleMuteSirenOnly = () => {
    audioAlarm.stop();
  };

  // Battery history simulation handlers
  const handleSimulate4hSession = () => {
    const points: BatteryHistoryPoint[] = [];
    const now = Date.now();
    const stepMinutes = 15;
    const count = 16; // 4 hours
    for (let i = count; i >= 0; i--) {
      const t = now - i * stepMinutes * 60 * 1000;
      const date = new Date(t);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const progress = (count - i) / count;
      points.push({
        timestamp: t,
        timeStr,
        phoneBattery: Math.round(96 - progress * 11), // 96% -> 85% (~2.75%/hr)
        wearableBattery: Math.round(88 - progress * 8), // 88% -> 80% (~2.0%/hr)
        isPhoneCharging: false,
      });
    }
    setBatteryHistory(points);
  };

  const handleSimulate8hSession = () => {
    const points: BatteryHistoryPoint[] = [];
    const now = Date.now();
    const stepMinutes = 30;
    const count = 16; // 8 hours
    for (let i = count; i >= 0; i--) {
      const t = now - i * stepMinutes * 60 * 1000;
      const date = new Date(t);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const progress = (count - i) / count;
      points.push({
        timestamp: t,
        timeStr,
        phoneBattery: Math.round(98 - progress * 22), // 98% -> 76% (~2.75%/hr)
        wearableBattery: Math.round(92 - progress * 17), // 92% -> 75% (~2.1%/hr)
        isPhoneCharging: false,
      });
    }
    setBatteryHistory(points);
  };

  const handleResetBatteryHistory = () => {
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setBatteryHistory([
      {
        timestamp: now,
        timeStr,
        phoneBattery: watchdog.phoneBatteryLevel ?? 92,
        wearableBattery: watchdog.deviceBatteryLevel ?? 88,
        isPhoneCharging: watchdog.isPhoneCharging ?? false,
      },
    ]);
  };

  // Connect to Polar BLE Device
  const handleConnectBle = async (options?: { acceptAllDevices?: boolean }) => {
    setBleError(null);
    try {
      signalSimulator.stop();
      setIsSimulatorMode(false);

      const device = await bluetooth.connect(options);
      setBleDevice(device);
      setIsBleConnected(true);
      setIsMonitoring(true);
      setDetectorState('MONITORING_SAFE');
      deadmanWatchdog.setMonitoringActive(true, config.deadmanTimeoutSeconds, config.minBatteryThreshold);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBleError(msg);
      setIsBleConnected(false);
      if (
        err instanceof BluetoothPermissionsPolicyError ||
        err instanceof BluetoothConnectionAttemptFailedError ||
        msg.includes('permissions policy') ||
        msg.includes('disallowed') ||
        msg.includes('Connection attempt failed') ||
        msg.includes('Connection Error') ||
        msg.includes('NetworkError') ||
        (err instanceof Error && err.name === 'SecurityError')
      ) {
        setIsPermissionsPolicyModalOpen(true);
      }
    }
  };

  // Disconnect BLE
  const handleDisconnectBle = () => {
    bluetooth.disconnect();
    signalSimulator.stop();
    setIsBleConnected(false);
    setBleDevice(null);
    setIsMonitoring(false);
    setDetectorState('IDLE');
    deadmanWatchdog.setMonitoringActive(false);
    audioAlarm.stop();
  };

  // Start Signal Simulator
  const handleStartSimulator = (scenario: SimulatorScenario = 'REST') => {
    if (isBleConnected) {
      bluetooth.disconnect();
      setIsBleConnected(false);
      setBleDevice(null);
    }

    setCurrentScenario(scenario);
    setIsSimulatorMode(true);
    setIsMonitoring(true);
    setDetectorState('MONITORING_SAFE');
    deadmanWatchdog.setMonitoringActive(true, config.deadmanTimeoutSeconds, config.minBatteryThreshold);
    signalSimulator.start(scenario);
  };

  // Switch Simulator Scenario
  const handleSelectScenario = (scenario: SimulatorScenario) => {
    setCurrentScenario(scenario);
    signalSimulator.setScenario(scenario);

    if (scenario === 'DEADMAN_DISCONNECT') {
      // Intentionally stop transmitting packets
    } else {
      deadmanWatchdog.recordPacketReceived();
      if (detectorState === 'FAULT_DISCONNECTED') {
        setDetectorState('MONITORING_SAFE');
        audioAlarm.stop();
      }
    }
  };

  // Stop all monitoring
  const handleStopMonitoring = () => {
    if (isBleConnected) {
      handleDisconnectBle();
    }
    if (isSimulatorMode) {
      signalSimulator.stop();
      setIsSimulatorMode(false);
    }
    setIsMonitoring(false);
    setDetectorState('IDLE');
    deadmanWatchdog.setMonitoringActive(false);
    audioAlarm.stop();
  };

  // Cancel Warning (User tapped "I am OK")
  const handleCancelWarning = () => {
    setDetectorState('MONITORING_SAFE');
    audioAlarm.stop();
  };

  // Silence Alarm & Resolve Episode
  const handleSilenceAlarm = () => {
    audioAlarm.stop();
    setDetectorState('MONITORING_SAFE');
  };

  // Acknowledge Dead Man Fault
  const handleResolveFault = () => {
    audioAlarm.stop();
    deadmanWatchdog.recordPacketReceived();
    setDetectorState('MONITORING_SAFE');
  };

  // Trigger Immediate Test Seizure Alert
  const handleTriggerTestAlarm = () => {
    if (!isMonitoring) {
      handleStartSimulator('SEIZURE');
    } else {
      handleSelectScenario('SEIZURE');
    }
    triggerEscalation('ALARM');
  };

  // Toggle Screen Wake Lock
  const handleToggleWakeLock = async () => {
    if (watchdog.isWakeLockActive) {
      deadmanWatchdog.releaseWakeLock();
    } else {
      await deadmanWatchdog.requestWakeLock();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract Compliant Header */}
      <Header
        detectorState={detectorState}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onTriggerTestAlarm={handleTriggerTestAlarm}
        isSirenPlaying={isSirenPlaying}
        onToggleSiren={handleToggleSiren}
        isNightMode={isNightMode}
        onToggleNightMode={() => setIsNightMode((prev) => !prev)}
        onOpenGitSync={() => setIsGitSyncOpen(true)}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Connection & Mode Control Strip */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Real Hardware BLE Connect */}
            {!isBleConnected ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleConnectBle({ acceptAllDevices: false })}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-md shadow-sky-600/20 transition-all active:scale-95"
                  title="Search for Polar Loop Gen2 / Polar sensors with Polar name prefix"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Pair Polar Loop Gen2 (BLE)</span>
                </button>
                <button
                  onClick={() => handleConnectBle({ acceptAllDevices: true })}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 transition-all"
                  title="If device shows as Unsupported or has custom advertising, scan all Bluetooth LE devices without name filter"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Scan Any BLE Device</span>
                  <span className="sm:hidden">Scan All</span>
                </button>
                {isIframe && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium text-xs border border-emerald-900/50 hover:border-emerald-700 transition-all"
                    title="Open in a standalone tab with unrestricted Web Bluetooth permissions"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Open Standalone for BLE</span>
                  </a>
                )}
              </div>
            ) : (
              <button
                onClick={handleDisconnectBle}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all"
              >
                <Bluetooth className="w-4 h-4 text-sky-400" />
                <span>Disconnect Polar Sensor</span>
              </button>
            )}

            {/* Signal Simulator Trigger */}
            {!isSimulatorMode ? (
              <button
                onClick={() => handleStartSimulator('REST')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>Start Signal Simulator</span>
              </button>
            ) : (
              <button
                onClick={handleStopMonitoring}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all"
              >
                <Square className="w-3.5 h-3.5 text-rose-400" />
                <span>Stop Simulator</span>
              </button>
            )}
          </div>

          {/* Simulator Scenario Selectors (When in Simulator Mode) */}
          {isSimulatorMode && (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-[11px] font-mono text-slate-500 px-2 uppercase">Scenario:</span>
              <button
                onClick={() => handleSelectScenario('REST')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  currentScenario === 'REST'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rest
              </button>
              <button
                onClick={() => handleSelectScenario('WALK')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  currentScenario === 'WALK'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Walking
              </button>
              <button
                onClick={() => handleSelectScenario('SEIZURE')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  currentScenario === 'SEIZURE'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                5 Hz Seizure
              </button>
              <button
                onClick={() => handleSelectScenario('DEADMAN_DISCONNECT')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  currentScenario === 'DEADMAN_DISCONNECT'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-orange-400 hover:text-orange-300'
                }`}
              >
                Drop Signal
              </button>
              <button
                onClick={() => handleSelectScenario('LOW_BATTERY')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  currentScenario === 'LOW_BATTERY'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                Low Batt
              </button>
            </div>
          )}
        </section>

        {/* BLE Error Banner */}
        {bleError && (
          <div className="bg-rose-950/70 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="space-y-0.5">
                <span className="font-semibold block text-white">
                  {bleError.includes('permissions policy') || bleError.includes('disallowed')
                    ? 'Bluetooth Pairing Blocked by Embedded Preview Frame'
                    : 'Bluetooth Connection Error'}
                </span>
                <span className="text-[11px] text-rose-300 block">
                  {bleError.includes('permissions policy') || bleError.includes('disallowed')
                    ? 'Browser security restricts Web Bluetooth inside iframes. Open standalone tab or use Polar Simulator.'
                    : bleError}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(bleError.includes('permissions policy') || bleError.includes('disallowed')) && (
                <>
                  <button
                    onClick={() => setIsPermissionsPolicyModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] transition-colors"
                  >
                    View Options
                  </button>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Standalone</span>
                  </a>
                  <button
                    onClick={() => {
                      setBleError(null);
                      handleStartSimulator('REST');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] border border-slate-700 transition-colors"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>Use Simulator</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setBleError(null)}
                className="text-slate-400 hover:text-white font-mono text-[11px] px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: TELEMETRY & FFT MONITOR */}
        {activeTab === 'monitor' && (
          <div className="space-y-6">
            {/* Polar Hardware BLE Telemetry & GATT Control Card */}
            {isBleConnected && bleDevice && (
              <PolarBleInspectorCard
                deviceInfo={bleDevice}
                isBleConnected={isBleConnected}
              />
            )}

            {/* Stream Mode & Sampling Rate Explanatory Banner (When in Epoch Mode) */}
            {isBleConnected && measuredSampleRate < 2.0 && samples.length >= 1 && (
              <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-amber-200">8-Second Activity Epoch Mode</span>
                      <span className="text-[10px] bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700/60 font-mono">
                        ~{measuredSampleRate > 0 ? (1.0 / measuredSampleRate).toFixed(1) : '8.0'}s / packet ({measuredSampleRate.toFixed(2)} Hz)
                      </span>
                    </div>
                    <p className="text-slate-300 mt-1 leading-relaxed">
                      Polar Loop 2 operates in periodic activity epoch mode. The table below actively tracks movement variation (&Delta;a). To attempt continuous 25 Hz streaming, tap <strong>Unlock 25Hz</strong>. To test 3–8 Hz FFT immediately, tap <strong>Test FFT</strong>.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={async () => {
                      try {
                        await bluetooth.unlock25HzStream();
                      } catch (e) {
                        console.warn(e);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow transition-colors flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Unlock 25Hz</span>
                  </button>
                  <button
                    onClick={() => handleStartSimulator('SEIZURE')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow transition-colors flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Test 5Hz FFT</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live 3D Waveform (Polar Hardware Gyroscope or Accelerometer) */}
            <TelemetryDisplay
              samples={samples}
              currentSample={currentSample}
              measuredSampleRate={measuredSampleRate}
              isBleConnected={isBleConnected}
              deviceName={
                bleDevice
                  ? `${bleDevice.name} (${
                      bleDevice.activeStreamType === 'GYRO'
                        ? 'Hardware Gyroscope 0x05'
                        : bleDevice.activeStreamType === 'ACC'
                        ? 'Hardware Accelerometer 0x02'
                        : 'Hardware BLE'
                    })`
                  : isSimulatorMode
                  ? 'Signal Simulator (Synthetic)'
                  : null
              }
              heartRate={currentSample?.hr}
              batteryLevel={watchdog.deviceBatteryLevel}
              sensorType={
                currentSample?.sensorType ||
                (bleDevice?.activeStreamType === 'GYRO' ? 'GYRO' : 'ACC')
              }
              currentAction={bleDevice?.streamDebug?.currentAction}
              totalSamplesCaptured={bleDevice?.streamDebug?.totalSamplesCaptured}
              lastPacketSamplesCount={bleDevice?.streamDebug?.lastPacketSamplesCount}
            />

            {/* Live Interval Motion Data Table & Real-Time Variation Inspector */}
            <MotionDataTable
              currentSample={currentSample}
              samples={samples}
              measuredSampleRate={measuredSampleRate}
              isBleConnected={isBleConnected}
              deviceName={bleDevice?.name || (isSimulatorMode ? 'Signal Simulator' : 'Polar Loop 2')}
              sensorType={
                currentSample?.sensorType ||
                (bleDevice?.activeStreamType === 'GYRO' ? 'GYRO' : 'ACC')
              }
              currentAction={bleDevice?.streamDebug?.currentAction}
              totalSamplesCaptured={bleDevice?.streamDebug?.totalSamplesCaptured}
              lastPacketSamplesCount={bleDevice?.streamDebug?.lastPacketSamplesCount}
            />

            {/* OpenSeizureDetector 3-8 Hz FFT Power Spectrum Visualizer */}
            <SpectrumVisualizer
              analysis={spectrumAnalysis}
              config={config}
              sampleCount={samples.length}
              measuredSampleRate={measuredSampleRate}
              isBleConnected={isBleConnected}
              onStartSimulator={() => handleStartSimulator('SEIZURE')}
            />

            {/* Quick Dead Man Telemetry Strip in Monitor Tab */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-orange-400" />
                <span className="text-slate-300">
                  Dead Man Heartbeat: <strong>{watchdog.packetAgeSeconds}s</strong> / {config.deadmanTimeoutSeconds}s
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Phone: {watchdog.phoneBatteryLevel}% {watchdog.isPhoneCharging ? '(Charging)' : ''}
                </span>
              </div>

              <button
                onClick={() => setActiveTab('diagnostics')}
                className="text-sky-400 hover:text-sky-300 font-sans font-medium"
              >
                View Full Diagnostics &rarr;
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DEAD MAN'S HANDLE & SELF-DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            <DeadmanCard
              watchdog={watchdog}
              deadmanTimeoutSeconds={config.deadmanTimeoutSeconds}
              onSimulateDeadmanDrop={() => {
                if (isSimulatorMode) {
                  handleSelectScenario('DEADMAN_DISCONNECT');
                } else {
                  handleStartSimulator('DEADMAN_DISCONNECT');
                }
              }}
              onToggleWakeLock={handleToggleWakeLock}
              onPlayDeadmanTone={() => audioAlarm.playDeadmanAlert(carerSettings.sirenVolume)}
            />

            {/* Real-time Hardware BLE Stream Characters & Timing Debugger */}
            {isBleConnected && bleDevice && (
              <StreamDebugConsole
                deviceInfo={bleDevice}
                isBleConnected={isBleConnected}
              />
            )}

            {/* End-to-End Cloud Dead Man's Watchdog & Battery Load Benchmark */}
            <CloudWatchdogCard
              cloudStatus={cloudStatus}
              deviceId={backendSync.getDeviceId()}
              onSendHeartbeatNow={() => {
                backendSync.sendHeartbeat({
                  detectorState: detectorStateRef.current,
                  bleConnected: isBleConnected || isSimulatorMode,
                  wearableBattery: watchdog.deviceBatteryLevel ?? 88,
                  phoneBattery: watchdog.phoneBatteryLevel ?? 92,
                  lastPacketAgeSeconds: watchdog.packetAgeSeconds,
                  peakRatio: spectrumAnalysis?.ratio ?? 0,
                  peakFrequency: spectrumAnalysis?.peakFrequency ?? 0,
                  carerContacts: carerSettings.contacts,
                });
              }}
              onRefreshStatus={() => backendSync.fetchCloudStatus()}
            />

            {/* Recharts Battery Drain & Discharge Trends */}
            <BatteryDrainChart
              history={batteryHistory}
              currentPhoneBattery={watchdog.phoneBatteryLevel ?? 92}
              currentWearableBattery={watchdog.deviceBatteryLevel ?? 88}
              isPhoneCharging={watchdog.isPhoneCharging}
              minBatteryThreshold={config.minBatteryThreshold}
              onSimulate4hSession={handleSimulate4hSession}
              onSimulate8hSession={handleSimulate8hSession}
              onResetHistory={handleResetBatteryHistory}
            />

            {/* Deep Diagnostic Specifications */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-xs space-y-4">
              <h3 className="font-bold text-white text-sm">
                Dead Man's Handle Architecture Specification
              </h3>
              <p className="text-slate-300 leading-relaxed">
                In medical safety systems, a "Dead Man's Handle" ensures that if the monitoring apparatus halts—whether by Bluetooth packet failure, battery depletion, accidental removal, or OS background suspension—it cannot fail silently.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400 mb-1">Packet Watchdog</div>
                  <div className="text-white font-semibold">1000ms Prober</div>
                  <div className="text-[10px] text-slate-500 mt-1">Triggers if age &gt; 30s</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400 mb-1">Battery Safety</div>
                  <div className="text-white font-semibold">&lt; 15% Threshold</div>
                  <div className="text-[10px] text-slate-500 mt-1">Wearable &amp; Phone checked</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-400 mb-1">Android Wake Lock</div>
                  <div className="text-white font-semibold">Screen Sentinel</div>
                  <div className="text-[10px] text-slate-500 mt-1">Prevents CPU deep sleep</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ALGORITHM GUIDE & GITHUB CONTRIBUTIONS */}
        {activeTab === 'about' && <OpenSeizureDetectorInfo />}
      </main>

      {/* Emergency Alarm & Warning Overlay Modal */}
      <AlarmModal
        state={detectorState}
        countdownSeconds={warningCountdown}
        totalGraceSeconds={config.alarmGraceSeconds}
        peakRatio={spectrumAnalysis?.ratio ?? 0.72}
        peakFrequency={spectrumAnalysis?.peakFrequency ?? 4.8}
        seizureDurationSeconds={seizureDuration}
        dispatchResults={dispatchResults}
        carerSettings={carerSettings}
        isSirenPlaying={isSirenPlaying}
        onCancelWarning={handleCancelWarning}
        onSilenceAlarm={handleSilenceAlarm}
        onMuteSirenOnly={handleMuteSirenOnly}
        onResolveFault={handleResolveFault}
      />

      {/* Settings & Configuration Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        carerSettings={carerSettings}
        onSaveCarerSettings={handleSaveCarerSettings}
        detectionConfig={config}
        onSaveDetectionConfig={handleSaveDetectionConfig}
        onSendTestSms={async () => {
          const results = await carerAlerts.dispatchFullEscalation('ALARM', {
            patientName: 'Test Alert Verification',
            peakRatio: 0.75,
            peakFrequency: 5.0,
            deviceName: 'Polar Loop 2',
          }, carerSettings);
          setDispatchResults(results);
        }}
        onTestPush={async () => {
          await carerAlerts.requestNotificationPermission();
          carerAlerts.sendPushNotification(
            'OpenSeizureDetector Test',
            'Caregiver emergency notifications and haptic alerts are active.'
          );
          carerAlerts.triggerVibration('ALARM');
        }}
      />

      {/* GitHub Sync Modal */}
      <GitSyncModal
        isOpen={isGitSyncOpen}
        onClose={() => setIsGitSyncOpen(false)}
      />

      {/* Bluetooth Permissions Policy Explainer & Fallback Modal */}
      <BluetoothPermissionsModal
        isOpen={isPermissionsPolicyModalOpen}
        onClose={() => setIsPermissionsPolicyModalOpen(false)}
        onRetryPairing={(unfiltered) => handleConnectBle({ acceptAllDevices: unfiltered })}
        onStartSimulator={() => handleStartSimulator('SEIZURE')}
        rawErrorMessage={bleError || undefined}
      />
    </div>
  );
}
