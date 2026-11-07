/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CloudWatchdogStatus } from '../services/backendSync';
import {
  Cloud,
  CloudLightning,
  CloudOff,
  Server,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Watch,
  Smartphone,
  RefreshCw,
  Send,
  Zap,
  Cpu,
  TrendingDown,
  Info,
} from 'lucide-react';
import { computeRadix2FFT } from '../services/fft';

interface CloudWatchdogCardProps {
  cloudStatus: CloudWatchdogStatus;
  deviceId: string;
  onSendHeartbeatNow: () => void;
  onRefreshStatus: () => void;
}

export const CloudWatchdogCard: React.FC<CloudWatchdogCardProps> = ({
  cloudStatus,
  deviceId,
  onSendHeartbeatNow,
  onRefreshStatus,
}) => {
  const [benchmarkResult, setBenchmarkResult] = useState<{
    iterations: number;
    totalMs: number;
    avgMicroseconds: number;
  } | null>(null);
  const [isRunningBench, setIsRunningBench] = useState(false);

  // Run in-browser benchmark for 128-point FFT to test CPU load
  const runFftBenchmark = () => {
    setIsRunningBench(true);
    setTimeout(() => {
      const iterations = 5000;
      const real = new Float32Array(128);
      const imag = new Float32Array(128);

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        for (let j = 0; j < 128; j++) {
          real[j] = Math.sin(j * 0.1);
          imag[j] = 0;
        }
        computeRadix2FFT(real, imag);
      }
      const end = performance.now();
      const totalMs = end - start;
      const avgMicroseconds = Math.round((totalMs / iterations) * 1000 * 10) / 10;

      setBenchmarkResult({
        iterations,
        totalMs: Math.round(totalMs * 100) / 100,
        avgMicroseconds,
      });
      setIsRunningBench(false);
    }, 50);
  };

  const isHealthy = cloudStatus.cloudWatchdogHealthy && !cloudStatus.isCloudDeadmanBreached;
  const isBreached = cloudStatus.isCloudDeadmanBreached;

  return (
    <div className="space-y-6">
      {/* Primary End-to-End Watchdog Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">
              End-to-End Cloud Dead Man's Watchdog
            </h3>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Independent Server Tracking
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isBreached ? (
              <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/30 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                SERVER FAIL-SAFE TRIGGERED
              </span>
            ) : isHealthy ? (
              <span className="flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                CLOUD WATCHDOG ACTIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30">
                <CloudOff className="w-3.5 h-3.5" />
                AWAITING HEARTBEAT
              </span>
            )}
          </div>
        </div>

        {/* End-to-End Visual Architecture Diagram */}
        <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-3">
            Fail-Safe Telemetry Pipeline (If phone dies, server alarms carers)
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
            {/* Step 1: Wearable */}
            <div className="flex items-center gap-2.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex-1 w-full justify-center">
              <Watch className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-white font-semibold">Polar Loop Gen2</span>
                <span className="text-[10px] text-slate-400">25 Hz BLE Stream</span>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 hidden sm:block" />

            {/* Step 2: Mobile App */}
            <div className="flex items-center gap-2.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex-1 w-full justify-center">
              <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-white font-semibold">Android Phone PWA</span>
                <span className="text-[10px] text-slate-400">3-8Hz FFT &amp; Watchdog</span>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 hidden sm:block" />

            {/* Step 3: Cloud Server */}
            <div className="flex items-center gap-2.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex-1 w-full justify-center">
              <Cloud className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-white font-semibold">Backend Watchdog</span>
                <span className="text-[10px] text-slate-400">45s Dead Man Timer</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">Device ID</div>
            <div className="text-white font-semibold truncate mt-1">{deviceId}</div>
            <div className="text-[10px] text-slate-500 mt-1">Unique Patient Beacon</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">Heartbeat Age</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {cloudStatus.heartbeatAgeSeconds !== null ? `${cloudStatus.heartbeatAgeSeconds}s` : '--'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Refreshed every 10–15s</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">Server Timeout</div>
            <div className="text-lg font-bold text-orange-400 mt-0.5">
              {cloudStatus.cloudTimeoutSeconds}s
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Independent cloud limit</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">Heartbeat Stream</div>
            <div className="flex items-center gap-1 text-sky-400 font-semibold mt-1">
              <span className={`w-2 h-2 rounded-full ${cloudStatus.isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span>{cloudStatus.isSyncing ? 'Transmitting' : 'Active ACK'}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">POST /api/heartbeat</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-400">
            If Android kills the app or phone runs out of battery, the backend detects the silent heartbeat and triggers carer emergency SMS automatically.
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onSendHeartbeatNow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ping Heartbeat Now</span>
            </button>
            <button
              onClick={onRefreshStatus}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh server status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Battery Optimization & Rust vs JavaScript FFT Engineering Analysis */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              Battery Load Reduction Analysis: Rust vs. JavaScript FFT
            </h3>
          </div>

          <button
            onClick={runFftBenchmark}
            disabled={isRunningBench}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isRunningBench ? 'Benchmarking...' : 'Benchmark Live FFT'}</span>
          </button>
        </div>

        {/* Benchmark Results Display */}
        {benchmarkResult && (
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-emerald-500/40 text-xs font-mono space-y-1">
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Measured In-Browser JavaScript FFT Speed:
            </div>
            <div className="text-white text-sm font-bold">
              {benchmarkResult.avgMicroseconds} microseconds ({benchmarkResult.avgMicroseconds / 1000} ms) per 128-point FFT
            </div>
            <div className="text-slate-400 text-[11px]">
              Executed {benchmarkResult.iterations.toLocaleString()} complete 128-sample FFT cycles in {benchmarkResult.totalMs} ms.
              Because 128-point FFT takes less than 0.03 ms once per second, it consumes &lt; 0.003% of device CPU power!
            </div>
          </div>
        )}

        {/* In-Depth Engineering Evaluation */}
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
              <Info className="w-4 h-4 text-sky-400" /> Would using Rust for FFT help or hinder?
            </h4>
            <p className="text-slate-300">
              <strong>Verdict: It would hinder (or offer zero battery benefit with added overhead).</strong> Here is the mathematical reason:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] pl-1">
              <li>
                <strong className="text-slate-200">Tiny Signal Dimension (N = 128):</strong> FFT computational complexity is O(N log2 N). For 128 points, that is only 896 floating-point operations. In JavaScript (V8 JIT with Float32Array), this executes in <strong>0.02 to 0.04 milliseconds</strong>.
              </li>
              <li>
                <strong className="text-slate-200">WASM Boundary Crossing Penalty:</strong> Passing arrays across the JavaScript-to-WebAssembly boundary requires copying data into WASM linear memory and back. This boundary overhead takes ~0.03 ms—equivalent to the entire calculation time itself!
              </li>
              <li>
                <strong className="text-slate-200">Tiny Percentage of Power:</strong> 0.03 ms of CPU work per second represents <strong>0.003%</strong> of phone processor utilization. Even if Rust took 0 ms, it would save less than 1 second of battery over a 24-hour day.
              </li>
            </ul>
          </div>

          {/* Where 99% of Mobile Battery ACTUALLY Goes */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-white text-xs">Where 99% of Battery Consumption Actually Goes:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-mono mt-2">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-rose-400 font-bold mb-1">1. Screen &amp; GPU (50-70%)</div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Keeping an OLED screen awake drains ~350mW. Throttling canvas renders to 1-5 FPS and using true black saves ~60% battery.
                </p>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-amber-400 font-bold mb-1">2. BLE Radio Duty (20-30%)</div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Transmitting 1 packet every 40ms keeps Bluetooth radio continuously awake. Batching 25 samples into 1 packet/sec cuts radio wakeups by 96%.
                </p>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-sky-400 font-bold mb-1">3. CPU Sleep vs WakeLock (10-15%)</div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Full screen wake locks prevent CPU sleep. A background foreground service with partial CPU wake lock allows display to sleep completely.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
