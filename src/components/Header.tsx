/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DetectorState } from '../types/seizure';
import {
  Activity,
  AlertTriangle,
  Bell,
  Download,
  Info,
  Radio,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';

interface HeaderProps {
  detectorState: DetectorState;
  activeTab: 'monitor' | 'diagnostics' | 'about';
  setActiveTab: (tab: 'monitor' | 'diagnostics' | 'about') => void;
  onOpenSettings: () => void;
  onTriggerTestAlarm: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  detectorState,
  activeTab,
  setActiveTab,
  onOpenSettings,
  onTriggerTestAlarm,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Status badge styling based on state
  const getStatusBadge = () => {
    switch (detectorState) {
      case 'MONITORING_SAFE':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Active · Safe</span>
          </div>
        );
      case 'WARNING':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Warning · Tremor</span>
          </div>
        );
      case 'ALARM':
        return (
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 animate-bounce">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>SEIZURE ALARM</span>
          </div>
        );
      case 'FAULT_DISCONNECTED':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400">
            <Radio className="w-3.5 h-3.5" />
            <span>Dead Man Fault</span>
          </div>
        );
      case 'FAULT_BATTERY':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Battery</span>
          </div>
        );
      case 'IDLE':
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Standby</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-rose-400 shadow-inner">
            <Activity className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              OpenSeizureDetector
            </span>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Polar Loop Gen2</span>
              <span aria-hidden="true">·</span>
              {getStatusBadge()}
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'monitor'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Telemetry & FFT
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'diagnostics'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dead Man Diagnostics
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'about'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Algorithm & OSD Guide
          </button>
        </nav>

        {/* Zone 3: Primary Action & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* PWA Install Button */}
          {isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all whitespace-nowrap active:scale-95"
              title="Install OpenSeizureDetector as Android PWA"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install PWA</span>
            </button>
          )}

          {isIOS && !isInstalled && (
            <button
              onClick={() => setShowIOSGuide(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add to Home</span>
            </button>
          )}

          {/* Test Emergency Siren Trigger */}
          <button
            onClick={onTriggerTestAlarm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 hover:text-white transition-colors whitespace-nowrap"
            title="Simulate immediate seizure alarm for carer testing"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Test Alert</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Configure Carers & Sensitivity"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-200">
            <h3 className="text-base font-bold text-white mb-2">Install on iOS Safari</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              To keep seizure monitoring and dead man watchdog active on iPhone:
            </p>
            <ol className="text-xs space-y-2 text-slate-300 mb-6 list-decimal list-inside bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <li>Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.</li>
              <li>Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.</li>
              <li>Launch from your Home Screen for standalone fullscreen monitoring.</li>
            </ol>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
