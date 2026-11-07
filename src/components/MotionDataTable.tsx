/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SensorSample } from '../types/seizure';
import { bluetooth, StreamActionRecord } from '../services/bluetooth';
import {
  Table,
  Pause,
  Play,
  Trash2,
  Download,
  Copy,
  Check,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Maximize2,
  Minimize2,
  Filter,
  Layers,
  Sparkles,
  Binary,
  Zap,
} from 'lucide-react';

interface MotionDataTableProps {
  currentSample: SensorSample | null;
  samples: SensorSample[];
  measuredSampleRate: number;
  isBleConnected: boolean;
  deviceName?: string | null;
  sensorType?: 'GYRO' | 'ACC';
  currentAction?: StreamActionRecord | null;
  totalSamplesCaptured?: number;
  lastPacketSamplesCount?: number;
}

interface TableRowItem {
  id: number;
  timestamp: number;
  timeStr: string;
  deltaMs: number | null;
  x: number;
  y: number;
  z: number;
  magnitude: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMag: number;
  rawX?: number;
  rawY?: number;
  rawZ?: number;
  rawHex?: string;
  packetNumber?: number;
  frameType?: number;
  samplesInPacket?: number;
  actionName?: string;
  actionSampleIndex?: number;
  motionLevel: 'STILL' | 'SUBTLE' | 'ACTIVE' | 'VIGOROUS';
}

export const MotionDataTable: React.FC<MotionDataTableProps> = ({
  currentSample,
  samples,
  measuredSampleRate,
  isBleConnected,
  deviceName,
  sensorType = 'ACC',
  currentAction,
  totalSamplesCaptured,
  lastPacketSamplesCount,
}) => {
  const [rows, setRows] = useState<TableRowItem[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [maxRows, setMaxRows] = useState<number>(50);
  const [displayMode, setDisplayMode] = useState<'both' | 'decoded' | 'raw'>('both');
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const prevSampleRef = useRef<SensorSample | null>(null);
  const rowCounterRef = useRef<number>(0);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const unitStr = sensorType === 'GYRO' ? '°/s' : 'G';

  // Ingest incoming sample into table rows
  useEffect(() => {
    if (!currentSample || isPaused) return;

    const prev = prevSampleRef.current;
    const now = currentSample.timestamp;

    const deltaMs = prev ? Math.max(0, now - prev.timestamp) : null;
    const deltaX = prev ? currentSample.x - prev.x : 0;
    const deltaY = prev ? currentSample.y - prev.y : 0;
    const deltaZ = prev ? currentSample.z - prev.z : 0;
    const deltaMag = prev ? currentSample.magnitude - prev.magnitude : 0;

    const absDeltaMag = Math.abs(deltaMag);
    let motionLevel: TableRowItem['motionLevel'] = 'STILL';
    if (absDeltaMag >= 0.35) {
      motionLevel = 'VIGOROUS';
    } else if (absDeltaMag >= 0.10) {
      motionLevel = 'ACTIVE';
    } else if (absDeltaMag >= 0.02) {
      motionLevel = 'SUBTLE';
    }

    const date = new Date(now);
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    const timeStr = `${date.toLocaleTimeString([], { hour12: false })}.${ms}`;

    rowCounterRef.current += 1;

    const newRow: TableRowItem = {
      id: rowCounterRef.current,
      timestamp: now,
      timeStr,
      deltaMs,
      x: currentSample.x,
      y: currentSample.y,
      z: currentSample.z,
      magnitude: currentSample.magnitude,
      deltaX,
      deltaY,
      deltaZ,
      deltaMag,
      rawX: currentSample.rawX,
      rawY: currentSample.rawY,
      rawZ: currentSample.rawZ,
      rawHex: currentSample.rawHex,
      packetNumber: currentSample.packetNumber,
      frameType: currentSample.frameType,
      samplesInPacket: currentSample.samplesInPacket ?? 1,
      actionName: currentSample.actionName || currentAction?.actionName,
      actionSampleIndex: currentSample.actionSampleIndex ?? currentAction?.samplesCaptured,
      motionLevel,
    };

    prevSampleRef.current = currentSample;

    setRows((prevRows) => {
      const next = [newRow, ...prevRows];
      if (next.length > maxRows) {
        return next.slice(0, maxRows);
      }
      return next;
    });
  }, [currentSample, isPaused, maxRows, currentAction]);

  // Window statistics calculation
  const stats = useMemo(() => {
    if (rows.length === 0) {
      return {
        avgIntervalMs: 0,
        rangeX: 0,
        rangeY: 0,
        rangeZ: 0,
        rangeMag: 0,
        stdDevMag: 0,
        maxMag: 0,
        minMag: 0,
        motionCount: 0,
      };
    }

    const validIntervals = rows.filter((r) => r.deltaMs !== null && r.deltaMs < 5000).map((r) => r.deltaMs as number);
    const avgIntervalMs =
      validIntervals.length > 0
        ? validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length
        : 1000 / (measuredSampleRate || 25);

    const xs = rows.map((r) => r.x);
    const ys = rows.map((r) => r.y);
    const zs = rows.map((r) => r.z);
    const mags = rows.map((r) => r.magnitude);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const minMag = Math.min(...mags);
    const maxMag = Math.max(...mags);

    // Standard deviation of magnitude over recent window
    const meanMag = mags.reduce((a, b) => a + b, 0) / mags.length;
    const variance = mags.reduce((sum, val) => sum + Math.pow(val - meanMag, 2), 0) / mags.length;
    const stdDevMag = Math.sqrt(variance);

    const motionCount = rows.filter((r) => r.motionLevel !== 'STILL').length;

    return {
      avgIntervalMs,
      rangeX: maxX - minX,
      rangeY: maxY - minY,
      rangeZ: maxZ - minZ,
      rangeMag: maxMag - minMag,
      stdDevMag,
      maxMag,
      minMag,
      motionCount,
    };
  }, [rows, measuredSampleRate]);

  // Filtered rows
  const displayedRows = useMemo(() => {
    if (!filterActiveOnly) return rows;
    return rows.filter((r) => r.motionLevel !== 'STILL');
  }, [rows, filterActiveOnly]);

  const handleClear = () => {
    setRows([]);
    prevSampleRef.current = null;
  };

  const handleExportCsv = () => {
    if (rows.length === 0) return;

    const headers = [
      'index',
      'timestamp_ms',
      'time_formatted',
      'interval_delta_ms',
      `x_${unitStr}`,
      `y_${unitStr}`,
      `z_${unitStr}`,
      `magnitude_${unitStr}`,
      'delta_x',
      'delta_y',
      'delta_z',
      'delta_mag',
      'raw_x',
      'raw_y',
      'raw_z',
      'motion_level',
      'raw_hex',
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.id,
          r.timestamp,
          `"${r.timeStr}"`,
          r.deltaMs ?? '',
          r.x.toFixed(4),
          r.y.toFixed(4),
          r.z.toFixed(4),
          r.magnitude.toFixed(4),
          r.deltaX.toFixed(4),
          r.deltaY.toFixed(4),
          r.deltaZ.toFixed(4),
          r.deltaMag.toFixed(4),
          r.rawX ?? '',
          r.rawY ?? '',
          r.rawZ ?? '',
          r.motionLevel,
          `"${r.rawHex ?? ''}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `polar_motion_intervals_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyJson = () => {
    if (rows.length === 0) return;
    const jsonStr = JSON.stringify(rows.slice(0, 20), null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const renderDeltaBadge = (val: number) => {
    const abs = Math.abs(val);
    if (abs < 0.01) {
      return (
        <span className="text-[10px] text-slate-500 font-mono flex items-center justify-end gap-0.5">
          <Minus className="w-2.5 h-2.5 text-slate-600" />
          <span>0.00</span>
        </span>
      );
    }
    const isPositive = val > 0;
    const color =
      abs >= 0.35
        ? 'text-rose-400 font-bold'
        : abs >= 0.10
        ? 'text-emerald-400 font-semibold'
        : 'text-sky-300';

    return (
      <span className={`text-[10px] font-mono flex items-center justify-end gap-0.5 ${color}`}>
        {isPositive ? (
          <ArrowUpRight className="w-2.5 h-2.5" />
        ) : (
          <ArrowDownRight className="w-2.5 h-2.5" />
        )}
        <span>
          {isPositive ? '+' : ''}
          {val.toFixed(2)}
        </span>
      </span>
    );
  };

  const actionName =
    currentAction?.actionName ||
    currentSample?.actionName ||
    (isBleConnected ? 'Polar Hardware Stream' : 'Simulator Stream');
  const actionSamplesCaptured =
    currentAction?.samplesCaptured ?? currentSample?.actionSampleIndex ?? rows.length;
  const actionPacketsCount =
    currentAction?.packetsReceived ?? (currentSample?.packetNumber ?? rows.length);
  const smpPerPacket =
    lastPacketSamplesCount ?? currentSample?.samplesInPacket ?? 1;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-950/80 border border-sky-800 text-sky-400 shadow-sm">
            <Table className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Live Interval Motion Data Table
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                {rows.length} rows · {actionSamplesCaptured} captured in {actionName}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live inspection of raw packet samples, timing intervals ($\Delta t$), and real-time variations
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs border transition-all ${
              isPaused
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-600/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={isPaused ? 'Resume live updates' : 'Pause updates to inspect values'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
            <span>{isPaused ? 'Resume Stream' : 'Freeze / Pause'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 disabled:opacity-40 transition-colors"
            title="Download captured intervals as CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={() => bluetooth.downloadRawPacketsJson()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 text-sky-300 font-medium text-xs border border-sky-700/60 transition-colors"
            title="Download full bit-for-bit raw GATT packet capture as JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Raw BLE JSON</span>
          </button>

          <button
            onClick={handleCopyJson}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs border border-slate-700 disabled:opacity-40 transition-colors"
            title="Copy recent 20 rows to clipboard as JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'JSON'}</span>
          </button>

          <button
            onClick={handleClear}
            disabled={rows.length === 0}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 disabled:opacity-40 transition-colors"
            title="Clear recorded table rows"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
            title={isExpanded ? 'Collapse table' : 'Expand table'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Variation & Motion KPI Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Stream & Action Sample Counter */}
        <div className="bg-slate-950 p-3 rounded-xl border border-sky-800/80 bg-gradient-to-b from-sky-950/25 to-slate-950">
          <div className="text-[11px] text-slate-400 flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-sky-300 font-semibold">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Action Samples</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-emerald-400">
            {actionSamplesCaptured.toLocaleString()}{' '}
            <span className="text-[11px] text-slate-400 font-normal">captured</span>
          </div>
          <div className="text-[10px] text-sky-200 font-mono truncate mt-0.5 font-medium" title={actionName}>
            {actionName}
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-0.5">
            {actionPacketsCount} pkts · {smpPerPacket} smp/pkt
          </div>
        </div>

        {/* Dynamic Motion Energy / Variance */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
          <div className="text-[11px] text-slate-400 flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-sky-400" />
              <span>Motion State</span>
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                stats.stdDevMag >= 0.15
                  ? 'bg-rose-400 animate-ping'
                  : stats.stdDevMag >= 0.03
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-600'
              }`}
            />
          </div>
          <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            {stats.stdDevMag >= 0.35 ? (
              <span className="text-rose-400 font-extrabold">Vigorous Shake</span>
            ) : stats.stdDevMag >= 0.10 ? (
              <span className="text-emerald-400 font-bold">Active Movement</span>
            ) : stats.stdDevMag >= 0.025 ? (
              <span className="text-sky-300 font-semibold">Subtle Motion</span>
            ) : (
              <span className="text-slate-400">Still / Resting</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Energy $\sigma$: {stats.stdDevMag.toFixed(3)} {unitStr}
          </div>
        </div>

        {/* Timing Interval Delta */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
          <div className="text-[11px] text-slate-400 mb-1">Average Interval ($\Delta t$)</div>
          <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-purple-300">
            {stats.avgIntervalMs > 0 ? `${stats.avgIntervalMs.toFixed(1)} ms` : '-- ms'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Rate: {measuredSampleRate.toFixed(1)} Hz
          </div>
        </div>

        {/* Peak-to-Peak Range (Max - Min) */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
          <div className="text-[11px] text-slate-400 mb-1">Peak-to-Peak Range</div>
          <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-amber-300">
            {stats.rangeMag.toFixed(3)} {unitStr}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Min: {stats.minMag.toFixed(2)} · Max: {stats.maxMag.toFixed(2)}
          </div>
        </div>

        {/* Dynamic Axis Deltas */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
          <div className="text-[11px] text-slate-400 mb-1">Axis Variation Ranges</div>
          <div className="text-[11px] font-mono tabular-nums space-y-0.5">
            <div className="flex justify-between text-sky-400">
              <span>$\Delta X$:</span>
              <span className="font-semibold">{stats.rangeX.toFixed(3)}</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>$\Delta Y$:</span>
              <span className="font-semibold">{stats.rangeY.toFixed(3)}</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>$\Delta Z$:</span>
              <span className="font-semibold">{stats.rangeZ.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* Filter & View Mode */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
            <span>View Settings</span>
            <Filter className="w-3 h-3 text-slate-500" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <button
              onClick={() => setFilterActiveOnly((p) => !p)}
              className={`px-2 py-0.5 rounded font-mono font-medium border transition-colors ${
                filterActiveOnly
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {filterActiveOnly ? 'Motion Only' : 'All Samples'}
            </button>
            <select
              value={maxRows}
              onChange={(e) => setMaxRows(Number(e.target.value))}
              aria-label="Table row buffer limit"
              className="bg-slate-900 text-slate-300 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[10px] focus:outline-none"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={200}>200 rows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expanded Table Content */}
      {isExpanded && (
        <div className="space-y-2">
          {/* View mode toggle bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <span className="text-slate-500 px-1.5 font-mono text-[10px]">Display:</span>
              <button
                onClick={() => setDisplayMode('both')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  displayMode === 'both' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Decoded + Raw ADC
              </button>
              <button
                onClick={() => setDisplayMode('decoded')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  displayMode === 'decoded' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Decoded Only ({unitStr})
              </button>
              <button
                onClick={() => setDisplayMode('raw')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  displayMode === 'raw' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Raw Counts (int16)
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Active Movement
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                Subtle ($\ge 0.02G$)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
                Static
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div
            ref={tableContainerRef}
            className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800"
          >
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead className="bg-slate-900/90 text-slate-400 sticky top-0 z-10 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-2 px-2.5 font-semibold text-center w-12">#</th>
                  <th className="py-2 px-2.5 font-semibold">Time (ms)</th>
                  <th className="py-2 px-2.5 font-semibold text-right">$\Delta t$</th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    X-Axis {displayMode !== 'raw' && `(${unitStr})`}
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    Y-Axis {displayMode !== 'raw' && `(${unitStr})`}
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right">
                    Z-Axis {displayMode !== 'raw' && `(${unitStr})`}
                  </th>
                  <th className="py-2 px-2.5 font-semibold text-right font-bold text-rose-300">
                    Magnitude |a|
                  </th>
                  {displayMode !== 'decoded' && (
                    <th className="py-2 px-2.5 font-semibold text-center">Raw Counts [X, Y, Z]</th>
                  )}
                  <th className="py-2 px-2.5 font-semibold text-center">Dynamic Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px] tabular-nums">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={displayMode !== 'decoded' ? 9 : 8} className="py-8 text-center text-slate-500 italic">
                      {isBleConnected
                        ? 'Awaiting streaming motion packets... Perform gentle wrist movements to watch values update.'
                        : 'Bluetooth not connected. Tap "Pair Polar Loop Gen2" or start Simulator to capture intervals.'}
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row, idx) => {
                    const isNewest = idx === 0 && !isPaused;
                    return (
                      <tr
                        key={`motion-row-${row.id}-${row.timestamp}-${idx}`}
                        className={`hover:bg-slate-900/60 transition-colors ${
                          isNewest
                            ? 'bg-sky-950/30 font-semibold'
                            : row.motionLevel === 'VIGOROUS'
                            ? 'bg-rose-950/20'
                            : row.motionLevel === 'ACTIVE'
                            ? 'bg-emerald-950/15'
                            : ''
                        }`}
                      >
                        {/* Sample index & action sample counter */}
                        <td className="py-1.5 px-2.5 text-center font-mono text-[10px] whitespace-nowrap">
                          <div className="text-slate-300 font-semibold">#{row.id}</div>
                          {row.actionSampleIndex !== undefined && (
                            <div className="text-[9px] text-emerald-400 font-medium">
                              act:{row.actionSampleIndex}
                            </div>
                          )}
                          {row.samplesInPacket && row.samplesInPacket > 1 && (
                            <span className="text-[8px] bg-purple-950 text-purple-300 px-1 rounded border border-purple-800">
                              {row.samplesInPacket}smp
                            </span>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="py-1.5 px-2.5 text-slate-300 whitespace-nowrap">
                          {row.timeStr}
                        </td>

                        {/* Delta t (ms) */}
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                          {row.deltaMs !== null ? (
                            <span
                              className={
                                row.deltaMs > 80
                                  ? 'text-amber-400 font-bold'
                                  : row.deltaMs < 20
                                  ? 'text-sky-300'
                                  : 'text-purple-300'
                              }
                            >
                              +{row.deltaMs} ms
                            </span>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )}
                        </td>

                        {/* X-Axis */}
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                          <div className="text-sky-400 font-medium">
                            {displayMode !== 'raw' ? row.x.toFixed(3) : row.rawX ?? row.x.toFixed(3)}
                          </div>
                          {renderDeltaBadge(row.deltaX)}
                        </td>

                        {/* Y-Axis */}
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                          <div className="text-amber-400 font-medium">
                            {displayMode !== 'raw' ? row.y.toFixed(3) : row.rawY ?? row.y.toFixed(3)}
                          </div>
                          {renderDeltaBadge(row.deltaY)}
                        </td>

                        {/* Z-Axis */}
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                          <div className="text-emerald-400 font-medium">
                            {displayMode !== 'raw' ? row.z.toFixed(3) : row.rawZ ?? row.z.toFixed(3)}
                          </div>
                          {renderDeltaBadge(row.deltaZ)}
                        </td>

                        {/* Magnitude */}
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap font-bold text-rose-400">
                          <div>{row.magnitude.toFixed(3)} {unitStr}</div>
                          {renderDeltaBadge(row.deltaMag)}
                        </td>

                        {/* Raw ADC Counts */}
                        {displayMode !== 'decoded' && (
                          <td className="py-1.5 px-2.5 text-center text-slate-400 whitespace-nowrap text-[10px]">
                            {row.rawX !== undefined ? (
                              <code className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">
                                [{row.rawX}, {row.rawY}, {row.rawZ}]
                              </code>
                            ) : (
                              <span className="text-slate-600">Synthetic</span>
                            )}
                          </td>
                        )}

                        {/* Motion Activity Status Badge */}
                        <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                          {row.motionLevel === 'VIGOROUS' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                              <Sparkles className="w-2.5 h-2.5" />
                              Vigorous
                            </span>
                          ) : row.motionLevel === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              <Activity className="w-2.5 h-2.5" />
                              Active
                            </span>
                          ) : row.motionLevel === 'SUBTLE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-sky-950 text-sky-300 border border-sky-800">
                              Subtle
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-900 text-slate-500 border border-slate-800">
                              Static
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
