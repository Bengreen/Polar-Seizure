/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BatteryHistoryPoint } from '../types/seizure';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  BatteryCharging,
  Clock,
  Download,
  Info,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Zap,
} from 'lucide-react';

interface BatteryDrainChartProps {
  history: BatteryHistoryPoint[];
  currentPhoneBattery: number;
  currentWearableBattery: number;
  isPhoneCharging?: boolean | null;
  minBatteryThreshold: number;
  onSimulate4hSession: () => void;
  onSimulate8hSession: () => void;
  onResetHistory: () => void;
}

export const BatteryDrainChart: React.FC<BatteryDrainChartProps> = ({
  history,
  currentPhoneBattery,
  currentWearableBattery,
  isPhoneCharging,
  minBatteryThreshold,
  onSimulate4hSession,
  onSimulate8hSession,
  onResetHistory,
}) => {
  const [selectedView, setSelectedView] = useState<'both' | 'wearable' | 'phone'>('both');

  // Compute drain rates (% per hour)
  const computeDrainRate = (key: 'phoneBattery' | 'wearableBattery') => {
    if (history.length < 2) return 0;
    const first = history[0];
    const last = history[history.length - 1];
    const hoursElapsed = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
    if (hoursElapsed <= 0.01) return 0;

    const delta = first[key] - last[key];
    const ratePerHour = delta / hoursElapsed;
    return Math.max(0, Math.round(ratePerHour * 10) / 10);
  };

  const phoneDrainRate = computeDrainRate('phoneBattery');
  const wearableDrainRate = computeDrainRate('wearableBattery');

  // Estimated hours to reach critical 15% threshold
  const estimateHoursRemaining = (currentLevel: number, ratePerHour: number) => {
    if (ratePerHour <= 0.1) return '> 24h';
    const usableCapacity = Math.max(0, currentLevel - minBatteryThreshold);
    const hours = usableCapacity / ratePerHour;
    return hours >= 24 ? '> 24h' : `${hours.toFixed(1)} hrs`;
  };

  const phoneRemaining = estimateHoursRemaining(currentPhoneBattery, phoneDrainRate || 2.8);
  const wearableRemaining = estimateHoursRemaining(currentWearableBattery, wearableDrainRate || 2.1);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">
            Battery Discharge & Power Drain Telemetry
          </h3>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            {history.length} snapshots logged
          </span>
        </div>

        {/* View filters and simulation controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setSelectedView('both')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedView === 'both' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setSelectedView('wearable')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedView === 'wearable' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wearable
            </button>
            <button
              onClick={() => setSelectedView('phone')}
              className={`px-2.5 py-1 rounded transition-colors ${
                selectedView === 'phone' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phone
            </button>
          </div>

          {/* Quick simulation buttons */}
          <button
            onClick={onSimulate4hSession}
            className="px-2.5 py-1 text-[11px] font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            title="Simulate a 4-hour monitoring discharge curve"
          >
            4h Night
          </button>
          <button
            onClick={onSimulate8hSession}
            className="px-2.5 py-1 text-[11px] font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            title="Simulate a full 8-hour overnight monitoring session"
          >
            8h Night
          </button>
          <button
            onClick={onResetHistory}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Reset history to current live values"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Analytical KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
        {/* Polar Wearable Drain Rate */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Polar Loop Drain</span>
            <span className="text-emerald-400 font-bold">{currentWearableBattery}%</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg font-bold text-white">
              {wearableDrainRate > 0 ? `-${wearableDrainRate}%` : '~2.1%'}
            </span>
            <span className="text-slate-500 text-[10px]">/ hour</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Longevity to 15%: <strong className="text-emerald-400">{wearableRemaining}</strong>
          </div>
        </div>

        {/* Android Phone Drain Rate */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Phone Drain</span>
            <span className="text-sky-400 font-bold">{currentPhoneBattery}%</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg font-bold text-white">
              {isPhoneCharging ? (
                <span className="text-emerald-400 flex items-center gap-1 text-sm font-semibold">
                  <BatteryCharging className="w-3.5 h-3.5" /> Charging
                </span>
              ) : phoneDrainRate > 0 ? (
                `-${phoneDrainRate}%`
              ) : (
                '~2.8%'
              )}
            </span>
            {!isPhoneCharging && <span className="text-slate-500 text-[10px]">/ hour</span>}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Longevity to 15%: <strong className="text-sky-400">{phoneRemaining}</strong>
          </div>
        </div>

        {/* Overnight 8h Feasibility */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400">8h Sleep Feasibility</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-emerald-300 text-xs">
              {currentWearableBattery > 35 && currentPhoneBattery > 35 ? 'EXCELLENT' : 'RECHARGE SOON'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Combined drain &lt; 25% for 8h sleep
          </div>
        </div>

        {/* Critical Fail-Safe Floor */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400">Dead Man Threshold</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg font-bold text-rose-400">{minBatteryThreshold}%</span>
            <span className="text-slate-500 text-[10px]">floor</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Emergency watchdog alerts carers below this
          </div>
        </div>
      </div>

      {/* Recharts Area Chart */}
      <div className="w-full h-64 bg-slate-950/70 rounded-xl p-3 border border-slate-800/80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
            <defs>
              {/* Gradient for Wearable */}
              <linearGradient id="wearableGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
              </linearGradient>

              {/* Gradient for Phone */}
              <linearGradient id="phoneGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="timeStr"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />

            <YAxis
              domain={[0, 100]}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v) => `${v}%`}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-mono space-y-1">
                      <div className="text-slate-400 border-b border-slate-800 pb-1 mb-1">
                        Time: <strong className="text-white">{label}</strong>
                      </div>
                      {payload.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between gap-4">
                          <span style={{ color: entry.color }} className="font-medium">
                            {entry.name}:
                          </span>
                          <span className="text-white font-bold tabular-nums">
                            {entry.value}%
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />

            <Legend
              verticalAlign="top"
              height={32}
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono' }}
            />

            {/* Critical Low Battery 15% Dead Man Reference Line */}
            <ReferenceLine
              y={minBatteryThreshold}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{
                value: `Dead Man Alert Floor (${minBatteryThreshold}%)`,
                fill: '#f43f5e',
                fontSize: 10,
                position: 'insideBottomRight',
                fontFamily: 'IBM Plex Mono',
              }}
            />

            {/* Wearable Battery Area Curve */}
            {(selectedView === 'both' || selectedView === 'wearable') && (
              <Area
                type="monotone"
                dataKey="wearableBattery"
                name="Polar Loop Wearable"
                stroke="#34d399"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#wearableGrad)"
                activeDot={{ r: 5, fill: '#34d399', stroke: '#022c22' }}
              />
            )}

            {/* Phone Battery Area Curve */}
            {(selectedView === 'both' || selectedView === 'phone') && (
              <Area
                type="monotone"
                dataKey="phoneBattery"
                name="Android Phone"
                stroke="#38bdf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#phoneGrad)"
                activeDot={{ r: 5, fill: '#38bdf8', stroke: '#082f49' }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Battery Optimization Insights Note */}
      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-200">Power Longevity Strategy:</strong>{' '}
          OpenSeizureDetector achieves ~2% battery drain per hour by maintaining an efficient 25 Hz in-place Cooley-Tukey Radix-2 FFT computation and throttling canvas render loops. The Android Screen Wake Lock keeps Bluetooth and FFT worker threads responsive in the background without incurring high CPU drain.
        </div>
      </div>
    </div>
  );
};
