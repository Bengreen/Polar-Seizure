/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BookOpen,
  Code2,
  ExternalLink,
  GitBranch,
  Github,
  Heart,
  HelpCircle,
  Lightbulb,
  Radio,
  Shield,
  Zap,
} from 'lucide-react';

export const OpenSeizureDetectorInfo: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Intro Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider">
              <Shield className="w-4 h-4" /> Open-Source Seizure Detection Ecosystem
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              OpenSeizureDetector & Polar Loop Gen2
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-2xl">
              OpenSeizureDetector (OSD) is an open-source initiative founded by Graham Jones to provide free, reliable tonic-clonic epileptic seizure detection on affordable consumer wearables.
            </p>
          </div>

          <a
            href="https://github.com/OpenSeizureDetector/OpenSeizureDetector"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors shrink-0 border border-slate-700"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">View GitHub Repo</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>

      {/* 3 Core Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1: The 3-8 Hz FFT Algorithm */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-800/60 text-sky-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">
            1. 3–8 Hz FFT Spectral Engine
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Major muscle groups during tonic-clonic clonic convulsions oscillate strictly in the <strong>3 to 8 Hz</strong> frequency band. Normal activities like walking (1–2 Hz) or brushing teeth (&gt;10 Hz) have vastly different spectral signatures.
          </p>
          <div className="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            Ratio = Power(3-8Hz) / TotalPower<br />
            Alarm when Ratio &gt; 0.55 &amp; Power &gt; 120
          </div>
        </div>

        {/* Pillar 2: Dead Man's Handle Watchdog */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-800/60 text-orange-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">
            2. Dead Man's Handle Watchdog
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            In seizure detection, a silent failure is dangerous. If the band falls off, runs out of charge, or Bluetooth disconnects, the watchdog triggers an escalating audible chime and alerts carers within <strong>30 seconds</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            Packet Heartbeat: &lt; 30s timeout<br />
            Battery Monitor: Alarms if &lt; 15%
          </div>
        </div>

        {/* Pillar 3: Low Battery Longevity */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 flex items-center justify-center">
            <Heart className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white">
            3. Battery Longevity on Android
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Engineered for all-night monitoring. Uses the Screen Wake Lock API, in-place Cooley-Tukey Radix-2 FFT computations (under 1ms CPU time), and deep OLED slate dark mode to minimize power consumption.
          </p>
          <div className="text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            CPU Load: &lt; 2% on mobile cores<br />
            OLED Black: Up to 60% display savings
          </div>
        </div>
      </div>

      {/* Contributing to OpenSeizureDetector Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center gap-2.5 text-white">
          <GitBranch className="w-5 h-5 text-rose-400" />
          <h3 className="text-base font-bold">
            How to Contribute to the OpenSeizureDetector Project
          </h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          OpenSeizureDetector welcomes community contributions from software engineers, medical professionals, and users. Here is how your work can directly improve the open-source project:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <div className="font-semibold text-rose-400 flex items-center gap-1.5">
              <Code2 className="w-4 h-4" /> 1. Polar BLE GATT DataSource Plugin
            </div>
            <p className="text-slate-400 leading-relaxed">
              Contribute a dedicated Polar Loop Gen2 / BLE data source module to the OpenSeizureDetector Android codebase (written in Java/Kotlin) or this Web Bluetooth PWA client.
            </p>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <div className="font-semibold text-sky-400 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4" /> 2. Algorithm Benchmarking & Dataset
            </div>
            <p className="text-slate-400 leading-relaxed">
              Export recorded sensor acceleration CSV files during real or simulated episodes to help the OSD community train and validate false-positive reduction filters.
            </p>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Radio className="w-4 h-4" /> 3. Carer Webhook & SMS Integrations
            </div>
            <p className="text-slate-400 leading-relaxed">
              Enhance OSD's alerting backend by submitting PRs for direct Twilio SMS, Telegram bot webhooks, or Home Assistant integration plugins.
            </p>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
            <div className="font-semibold text-amber-400 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" /> 4. Join the OSD Community Forum
            </div>
            <p className="text-slate-400 leading-relaxed">
              Engage with Graham Jones and the OpenSeizureDetector user group at{' '}
              <a
                href="https://openseizuredetector.org.uk"
                target="_blank"
                rel="noreferrer"
                className="text-rose-400 underline hover:text-rose-300"
              >
                openseizuredetector.org.uk
              </a>{' '}
              to share hardware findings and user experiences.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
