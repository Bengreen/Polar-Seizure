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
} from './types/seizure';
import { analyzeAccelerometerWindow } from './services/fft';
import { bluetooth, BluetoothDeviceInfo } from './services/bluetooth';
import { signalSimulator, SimulatorScenario } from './services/simulator';
import { audioAlarm } from './services/audioAlarm';
import { carerAlerts, DispatchResult } from './services/carerAlerts';
import { deadmanWatchdog } from './services/deadmanWatchdog';
import { Header } from './components/Header';
import { TelemetryDisplay } from './components/TelemetryDisplay';
import { SpectrumVisualizer } from './components/SpectrumVisualizer';
import { DeadmanCard } from './components/DeadmanCard';
import { AlarmModal } from './components/AlarmModal';
import { SettingsModal } from './components/SettingsModal';
import { OpenSeizureDetectorInfo } from './components/OpenSeizureDetectorInfo';
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
  sirenVolume: 0.85,
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

  // Core Detector State
  const [detectorState, setDetectorState] = useState<DetectorState>('IDLE');
  const [isMonitoring, setIsMonitoring] = useState(false);

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
        audioAlarm.startSeizureSiren(carerSettings.sirenVolume);
      } else if (
        (targetState === 'FAULT_DISCONNECTED' || targetState === 'FAULT_BATTERY') &&
        carerSettings.enableSiren
      ) {
        audioAlarm.playDeadmanAlert(carerSettings.sirenVolume);
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
        const duration = (now - sampleTimestampsRef.current[0]) / 1000.0;
        if (duration > 0) {
          setMeasuredSampleRate(Math.round((sampleTimestampsRef.current.length / duration) * 10) / 10);
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

  // Setup BLE and Simulator sample subscriptions
  useEffect(() => {
    const unsubBle = bluetooth.onSample(handleIncomingSample);
    const unsubSim = signalSimulator.onSample(handleIncomingSample);

    const unsubBleBattery = bluetooth.onBatteryChange((batt) => {
      deadmanWatchdog.setDeviceBattery(batt);
    });
    const unsubSimBattery = signalSimulator.onBatteryChange((batt) => {
      deadmanWatchdog.setDeviceBattery(batt);
    });

    return () => {
      unsubBle();
      unsubSim();
      unsubBleBattery();
      unsubSimBattery();
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
  }, [bleDevice, isSimulatorMode, isBleConnected, triggerEscalation]);

  // Connect to Polar BLE Device
  const handleConnectBle = async () => {
    setBleError(null);
    try {
      signalSimulator.stop();
      setIsSimulatorMode(false);

      const device = await bluetooth.connect();
      setBleDevice(device);
      setIsBleConnected(true);
      setIsMonitoring(true);
      setDetectorState('MONITORING_SAFE');
      deadmanWatchdog.setMonitoringActive(true, config.deadmanTimeoutSeconds, config.minBatteryThreshold);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBleError(msg);
      setIsBleConnected(false);
    }
  };

  // Disconnect BLE
  const handleDisconnectBle = () => {
    bluetooth.disconnect();
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
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Connection & Mode Control Strip */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Real Hardware BLE Connect */}
            {!isBleConnected ? (
              <button
                onClick={handleConnectBle}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-md shadow-sky-600/20 transition-all active:scale-95"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Pair Polar Loop Gen2 (BLE)</span>
              </button>
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
          <div className="bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{bleError}</span>
            </div>
            <button
              onClick={() => setBleError(null)}
              className="text-slate-400 hover:text-white font-mono"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: TELEMETRY & FFT MONITOR */}
        {activeTab === 'monitor' && (
          <div className="space-y-6">
            {/* Live 3D Acceleration Waveform */}
            <TelemetryDisplay
              samples={samples}
              currentSample={currentSample}
              measuredSampleRate={measuredSampleRate}
              isBleConnected={isBleConnected}
              deviceName={bleDevice?.name || (isSimulatorMode ? 'Signal Simulator' : null)}
              heartRate={currentSample?.hr}
              batteryLevel={watchdog.deviceBatteryLevel}
            />

            {/* OpenSeizureDetector 3-8 Hz FFT Power Spectrum Visualizer */}
            <SpectrumVisualizer
              analysis={spectrumAnalysis}
              config={config}
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
        onCancelWarning={handleCancelWarning}
        onSilenceAlarm={handleSilenceAlarm}
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
          alert('Test alert dispatched to configured carers. Check SMS and Push status.');
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
    </div>
  );
}
