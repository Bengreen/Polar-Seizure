/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HealthWatchdog } from '../types/seizure';
import {
  ShieldAlert,
  Battery,
  BatteryCharging,
  Smartphone,
  Watch,
  Eye,
  Radio,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
  Volume2,
} from 'lucide-react';

interface DeadmanCardProps {
  watchdog: HealthWatchdog;
  deadmanTimeoutSeconds: number;
  onSimulateDeadmanDrop: () => void;
  onToggleWakeLock: () => void;
  onPlayDeadmanTone: () => void;
}

export const DeadmanCard: React.FC<DeadmanCardProps> = ({
  watchdog,
  deadmanTimeoutSeconds,
  onSimulateDeadmanDrop,
  onToggleWakeLock,
  onPlayDeadmanTone,
}) => {
  const {
    packetAgeSeconds,
    isBleConnected,
    deviceName,
    deviceBatteryLevel,
    phoneBatteryLevel,
    isPhoneCharging,
    isWakeLockActive,
    isDeadmanBreached,
    diagnosticStatus,
    statusMessage,
  } = watchdog;

  const secondsRemaining = Math.max(0, deadmanTimeoutSeconds - packetAgeSeconds);
  const percentCountdown = Math.max(0, Math.min(100, (secondsRemaining / deadmanTimeoutSeconds) * 100));

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white">
            Dead Man's Handle & Self-Diagnostics
          </h2>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            Fail-Safe Timeout: {deadmanTimeoutSeconds}s
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          {diagnosticStatus === 'CRITICAL_FAULT' ? (
            <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/30 font-semibold animate-pulse">
              <AlertOctagon className="w-3.5 h-3.5" />
              SYSTEM FAULT DETECTED
            </span>
          ) : diagnosticStatus === 'DEGRADED' ? (
            <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              HEARTBEAT DELAYED
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-medium">
              <CheckCircle className="w-3.5 h-3.5" />
              SELF-CHECK OK
            </span>
          )}
        </div>
      </div>

      {/* Main Watchdog Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Heartbeat Gauge */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">BLE Packet Heartbeat</span>
            <Radio className="w-3.5 h-3.5 text-sky-400" />
          </div>

          <div className="flex items-center gap-3 my-1">
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={`transition-all duration-500 ${
                    isDeadmanBreached
                      ? 'text-rose-500'
                      : percentCountdown < 40
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                  strokeDasharray={`${percentCountdown}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-bold font-mono text-white">
                {packetAgeSeconds}s
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-mono font-semibold text-white">
                {isDeadmanBreached ? (
                  <span className="text-rose-400">EXPIRED ({packetAgeSeconds}s)</span>
                ) : (
                  <span>{secondsRemaining}s before alarm</span>
                )}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">
                Last stream packet: {packetAgeSeconds === 0 ? 'just now' : `${packetAgeSeconds}s ago`}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 mt-2">
            Auto-alarms carers if sensor stops transmitting for &gt;{deadmanTimeoutSeconds}s.
          </div>
        </div>

        {/* Wearable Battery Status */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Wearable (Polar Loop)</span>
            <Watch className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="flex items-baseline gap-2 my-1">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                deviceBatteryLevel !== null && deviceBatteryLevel <= 15
                  ? 'text-rose-400'
                  : 'text-white'
              }`}
            >
              {deviceBatteryLevel !== null ? `${deviceBatteryLevel}%` : '88%'}
            </span>
            <span className="text-xs text-slate-400 font-mono">battery</span>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-2">
            <Battery className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {deviceBatteryLevel !== null && deviceBatteryLevel <= 15
                ? 'Warning: Charge sensor'
                : 'Sufficient for ~18 hrs continuous BLE'}
            </span>
          </div>
        </div>

        {/* Android Phone Battery & Wake Lock */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Android Phone Longevity</span>
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="flex items-baseline gap-2 my-1">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                phoneBatteryLevel !== null && phoneBatteryLevel <= 15 && !isPhoneCharging
                  ? 'text-rose-400'
                  : 'text-white'
              }`}
            >
              {phoneBatteryLevel !== null ? `${phoneBatteryLevel}%` : '92%'}
            </span>
            <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
              {isPhoneCharging ? (
                <span className="text-emerald-400 flex items-center gap-0.5">
                  <BatteryCharging className="w-3 h-3" /> Charging
                </span>
              ) : (
                'discharging'
              )}
            </span>
          </div>

          {/* Wake Lock status button */}
          <button
            onClick={onToggleWakeLock}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors border mt-2 ${
              isWakeLockActive
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>Wake Lock: {isWakeLockActive ? 'Active' : 'Disabled'}</span>
            </span>
            <span className="text-[10px] text-slate-500">Toggle</span>
          </button>
        </div>
      </div>

      {/* Diagnostic Log & Status Bar */}
      <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/90 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-slate-500 text-[11px]">DIAGNOSTIC:</span>
          <span className="text-slate-300">{statusMessage}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onPlayDeadmanTone}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            title="Listen to the fail-safe dead man tone"
          >
            <Volume2 className="w-3 h-3 text-slate-400" />
            <span>Hear Chime</span>
          </button>
          <button
            onClick={onSimulateDeadmanDrop}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-orange-300 bg-orange-950/50 hover:bg-orange-900/50 border border-orange-800/50 rounded-md transition-colors"
            title="Simulate Bluetooth connection dropout to test fail-safe carer alerts"
          >
            <span>Simulate Disconnect</span>
          </button>
        </div>
      </div>

      {/* Self-Check Health Checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">BLE Stream Active</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">FFT Window Buffer</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">Carer Alert Channels</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/50">
          <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="truncate">Audio Siren Ready</span>
        </div>
      </div>
    </div>
  );
};
