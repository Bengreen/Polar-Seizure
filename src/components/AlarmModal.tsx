/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { DetectorState, CarerSettings } from '../types/seizure';
import { DispatchResult } from '../services/carerAlerts';
import {
  AlertTriangle,
  BellOff,
  CheckCircle,
  Clock,
  Radio,
  Send,
  ShieldAlert,
  Smartphone,
  Volume2,
  XCircle,
} from 'lucide-react';

interface AlarmModalProps {
  state: DetectorState;
  countdownSeconds: number;
  totalGraceSeconds: number;
  peakRatio: number;
  peakFrequency: number;
  seizureDurationSeconds: number;
  dispatchResults: DispatchResult[];
  carerSettings: CarerSettings;
  onCancelWarning: () => void;
  onSilenceAlarm: () => void;
  onResolveFault: () => void;
}

export const AlarmModal: React.FC<AlarmModalProps> = ({
  state,
  countdownSeconds,
  totalGraceSeconds,
  peakRatio,
  peakFrequency,
  seizureDurationSeconds,
  dispatchResults,
  carerSettings,
  onCancelWarning,
  onSilenceAlarm,
  onResolveFault,
}) => {
  if (state === 'IDLE' || state === 'MONITORING_SAFE') {
    return null;
  }

  const isWarning = state === 'WARNING';
  const isAlarm = state === 'ALARM';
  const isDeadman = state === 'FAULT_DISCONNECTED' || state === 'FAULT_BATTERY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div
        className={`w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border transition-all ${
          isAlarm
            ? 'bg-rose-950/90 border-rose-600 ring-4 ring-rose-500/20'
            : isWarning
            ? 'bg-amber-950/90 border-amber-500 ring-4 ring-amber-500/20'
            : 'bg-orange-950/90 border-orange-600 ring-4 ring-orange-500/20'
        }`}
      >
        {/* State Banner */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isAlarm
                ? 'bg-rose-600 text-white animate-bounce'
                : isWarning
                ? 'bg-amber-500 text-slate-950 animate-pulse'
                : 'bg-orange-600 text-white animate-pulse'
            }`}
          >
            {isAlarm ? (
              <ShieldAlert className="w-7 h-7" />
            ) : isWarning ? (
              <AlertTriangle className="w-7 h-7" />
            ) : (
              <Radio className="w-7 h-7" />
            )}
          </div>

          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider font-mono font-semibold text-slate-400">
              OpenSeizureDetector Status
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {isAlarm
                ? 'SEIZURE DETECTED — CARERS ALERTED'
                : isWarning
                ? 'POSSIBLE SEIZURE TREMOR'
                : 'DEAD MAN WATCHDOG FAULT'}
            </h2>
          </div>
        </div>

        {/* Warning Phase: 10s Grace Countdown */}
        {isWarning && (
          <div className="mb-6 space-y-4">
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-amber-500/40 text-center">
              <div className="text-xs font-mono uppercase text-amber-400 mb-1">
                Pre-Alarm Cancellation Window
              </div>
              <div className="text-5xl font-black font-mono text-white tracking-tight my-2">
                {countdownSeconds}s
              </div>
              <div className="text-xs text-slate-300">
                Sustained rhythmic tremor detected ({peakFrequency.toFixed(1)} Hz). If you are okay, tap below to cancel carer alerts.
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-900 h-2 rounded-full mt-4 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${(countdownSeconds / totalGraceSeconds) * 100}%` }}
                />
              </div>
            </div>

            {/* Prominent CANCEL BUTTON (Large mobile hit target) */}
            <button
              onClick={onCancelWarning}
              className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/30 transition-transform"
            >
              <CheckCircle className="w-6 h-6" />
              <span>I AM OK — CANCEL ALARM</span>
            </button>
          </div>
        )}

        {/* Alarm Phase: Full Seizure Active */}
        {isAlarm && (
          <div className="mb-6 space-y-4">
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-rose-500/50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-mono uppercase text-rose-400 font-semibold flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 animate-pulse" /> Emergency Siren Active
                </span>
                <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Duration: <strong className="text-white tabular-nums">{seizureDurationSeconds}s</strong>
                </span>
              </div>

              <div className="text-xs text-slate-300 space-y-1">
                <p>
                  High-amplitude 3–8 Hz clonic convulsions verified (Tremor Ratio: <strong>{(peakRatio * 100).toFixed(0)}%</strong>).
                </p>
                <p className="text-[11px] text-slate-400">
                  Carers are being notified with location and episode timestamp.
                </p>
              </div>
            </div>

            {/* Carer Notification Logs */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 max-h-40 overflow-y-auto">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Send className="w-3 h-3 text-sky-400" /> Escalation Dispatch Log
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                {dispatchResults.length > 0 ? (
                  dispatchResults.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-slate-300">
                      <span className="truncate pr-2">{r.message}</span>
                      <span className={r.success ? 'text-emerald-400 shrink-0' : 'text-rose-400 shrink-0'}>
                        {r.success ? 'Sent' : 'Failed'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-xs">Dispatching SMS & Push to carers...</div>
                )}
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={onSilenceAlarm}
              className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition-transform"
            >
              <BellOff className="w-5 h-5" />
              <span>Silence Siren & Resolve Episode</span>
            </button>
          </div>
        )}

        {/* Dead Man's Handle Fault Phase */}
        {isDeadman && (
          <div className="mb-6 space-y-4">
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-orange-500/50">
              <h3 className="text-sm font-bold text-orange-400 mb-1">
                Monitoring Suspended — Fail-Safe Activated
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                No telemetry packets received for over 30 seconds, or battery has depleted. In seizure monitoring, loss of signal is treated as a critical fault.
              </p>
              <div className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <strong>Corrective Actions:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Check if Polar Loop is within Bluetooth range (&lt;10m)</li>
                  <li>Verify band battery is charged</li>
                  <li>Ensure Android Bluetooth is toggled ON</li>
                </ul>
              </div>
            </div>

            <button
              onClick={onResolveFault}
              className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 transition-transform"
            >
              <XCircle className="w-5 h-5" />
              <span>Acknowledge Fault & Reconnect</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
