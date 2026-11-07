/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SensorSample } from '../types/seizure';
import { StreamActionRecord } from '../services/bluetooth';
import { Heart, Gauge, Bluetooth, Radio, Compass, Activity, ZoomIn, Layers, Binary, Zap } from 'lucide-react';

interface TelemetryDisplayProps {
  samples: SensorSample[];
  currentSample: SensorSample | null;
  measuredSampleRate: number;
  isBleConnected: boolean;
  deviceName: string | null;
  heartRate?: number;
  batteryLevel?: number | null;
  sensorType?: 'GYRO' | 'ACC';
  currentAction?: StreamActionRecord | null;
  totalSamplesCaptured?: number;
  lastPacketSamplesCount?: number;
}

type ZoomLevel = 'auto' | '5x' | '2x' | '1x';

export const TelemetryDisplay: React.FC<TelemetryDisplayProps> = ({
  samples,
  currentSample,
  measuredSampleRate,
  isBleConnected,
  deviceName,
  heartRate,
  batteryLevel,
  sensorType = 'ACC',
  currentAction,
  totalSamplesCaptured,
  lastPacketSamplesCount,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('auto');
  const isGyro = (currentSample?.sensorType || sensorType) === 'GYRO';
  const unitStr = isGyro ? '°/s' : 'G';

  // Calculate instantaneous delta from previous sample
  const prevSampleRef = useRef<SensorSample | null>(null);
  const [instantDelta, setInstantDelta] = useState<{ dx: number; dy: number; dz: number; dMag: number }>({
    dx: 0,
    dy: 0,
    dz: 0,
    dMag: 0,
  });

  useEffect(() => {
    if (!currentSample) return;
    if (prevSampleRef.current) {
      setInstantDelta({
        dx: currentSample.x - prevSampleRef.current.x,
        dy: currentSample.y - prevSampleRef.current.y,
        dz: currentSample.z - prevSampleRef.current.z,
        dMag: currentSample.magnitude - prevSampleRef.current.magnitude,
      });
    }
    prevSampleRef.current = currentSample;
  }, [currentSample]);

  // Dynamic bounds for auto-scale
  const bounds = useMemo(() => {
    if (samples.length < 2) {
      return { min: isGyro ? -200 : -2.0, max: isGyro ? 200 : 2.0 };
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    samples.forEach((s) => {
      const vals = [s.x, s.y, s.z, s.magnitude];
      vals.forEach((v) => {
        if (!isNaN(v) && isFinite(v)) {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      });
    });

    if (minVal === Infinity || maxVal === -Infinity) {
      minVal = isGyro ? 0 : -1.5;
      maxVal = isGyro ? 300 : 2.5;
    }

    // Add padding headroom
    const range = Math.max(0.2, maxVal - minVal);
    const padding = range * 0.15;
    return {
      min: minVal - padding,
      max: maxVal + padding,
    };
  }, [samples, isGyro]);

  // Render 3D Gyro / Acceleration Waveform with Dynamic Auto-Scale
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Subtle background grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Draw horizontal grid lines
    const gridRows = 4;
    for (let i = 1; i < gridRows; i++) {
      const gy = (height / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    if (samples.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText(
        isBleConnected
          ? `Polar BLE connected (${measuredSampleRate.toFixed(1)} Hz). Streaming motion frames...`
          : 'Awaiting sensor stream...',
        16,
        height / 2 - 6
      );
      return;
    }

    // Compute coordinate mapping
    let yMin = bounds.min;
    let yMax = bounds.max;

    if (zoomLevel === '1x') {
      yMin = isGyro ? -500 : -3.0;
      yMax = isGyro ? 500 : 3.0;
    } else if (zoomLevel === '2x') {
      yMin = isGyro ? -250 : -1.5;
      yMax = isGyro ? 250 : 2.0;
    } else if (zoomLevel === '5x') {
      const center = currentSample ? currentSample.magnitude : 1.0;
      yMin = center - 0.4;
      yMax = center + 0.4;
    }

    const yRange = Math.max(0.1, yMax - yMin);
    const mapY = (val: number): number => {
      const norm = (val - yMin) / yRange;
      const y = height - norm * height;
      return Math.max(4, Math.min(height - 4, y));
    };

    // Draw zero reference line if within bounds
    if (yMin <= 0 && yMax >= 0) {
      const zeroY = mapY(0);
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const step = width / (samples.length - 1);

    // Draw X Axis (Cyan - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 1.2;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = mapY(s.x);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Y Axis (Amber - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.2;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = mapY(s.y);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Z Axis (Emerald - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
    ctx.lineWidth = 1.2;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = mapY(s.z);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Magnitude Line (Rose - prominent)
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.2;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = mapY(s.magnitude);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Render scale watermark
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText(`Top: ${yMax.toFixed(2)} ${unitStr}`, 8, 14);
    ctx.fillText(`Btm: ${yMin.toFixed(2)} ${unitStr}`, 8, height - 6);
  }, [samples, zoomLevel, bounds, isGyro, isBleConnected, measuredSampleRate, currentSample, unitStr]);

  const absDMag = Math.abs(instantDelta.dMag);
  const isMoving = absDMag >= 0.03;

  const actionName =
    currentAction?.actionName ||
    currentSample?.actionName ||
    (isBleConnected ? 'Polar Hardware Stream' : 'Simulator Stream');
  const actionSamplesCaptured =
    currentAction?.samplesCaptured ?? currentSample?.actionSampleIndex ?? samples.length;
  const actionPacketsCount =
    currentAction?.packetsReceived ?? (currentSample?.packetNumber ?? samples.length);
  const smpPerPacket =
    lastPacketSamplesCount ?? currentSample?.samplesInPacket ?? 1;
  const sessionTotalSamples =
    totalSamplesCaptured ?? samples.length;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
      {/* Header telemetry strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {isBleConnected ? (
            <Bluetooth className="w-4 h-4 text-sky-400" />
          ) : (
            <Radio className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-sm font-semibold text-white">
            {deviceName || (isBleConnected ? 'Polar Loop 2' : 'Synthetic Stream')}
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {measuredSampleRate.toFixed(1)} Hz
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              isGyro
                ? 'bg-purple-950/80 border-purple-700 text-purple-300'
                : 'bg-sky-950/80 border-sky-700 text-sky-300'
            }`}
          >
            {isGyro ? 'POLAR GYROSCOPE (DPS)' : 'POLAR ACCELEROMETER (G)'}
          </span>
        </div>

        {/* Vital stats row */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
          {/* Movement activity badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] ${
              isMoving
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isMoving ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
              }`}
            />
            <span>{isMoving ? `Moving (Δ: ${absDMag.toFixed(3)}G)` : 'Still'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            <span>{heartRate ? `${heartRate} bpm` : '-- bpm'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            {isGyro ? (
              <Compass className="w-3.5 h-3.5 text-purple-400" />
            ) : (
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-semibold text-white">
              |{isGyro ? 'ω' : 'a'}|: {currentSample ? currentSample.magnitude.toFixed(3) : isGyro ? '0.000' : '1.000'}{' '}
              {unitStr}
            </span>
          </div>

          {batteryLevel !== undefined && batteryLevel !== null && (
            <div className="flex items-center gap-1.5 text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  batteryLevel < 20 ? 'bg-rose-500' : 'bg-emerald-400'
                }`}
              />
              <span>{batteryLevel}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Stream & Action Sample Tracking Bar */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/80 border border-sky-800 text-sky-300 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400 font-normal">Action:</span>
            <span className="truncate max-w-[180px] sm:max-w-xs text-white">{actionName}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-slate-400">Captured in Action:</span>
            <span className="font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[11px] text-emerald-400 tabular-nums">
              {actionSamplesCaptured.toLocaleString()} samples
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400 tabular-nums">
          <div className="flex items-center gap-1">
            <Binary className="w-3 h-3 text-purple-400" />
            <span>Packets:</span>
            <span className="text-white font-semibold">{actionPacketsCount}</span>
            <span className="text-purple-300 font-medium">({smpPerPacket} smp/pkt)</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-sky-400" />
            <span>Session Total:</span>
            <span className="text-sky-300 font-bold">{sessionTotalSamples.toLocaleString()} samples</span>
          </div>
        </div>
      </div>

      {/* 3D Waveform Canvas with Zoom Selector */}
      <div className="relative w-full h-44 bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800/80">
        <canvas ref={canvasRef} width={700} height={176} className="w-full h-full block" />

        {/* Zoom & Sensitivity Bar */}
        <div className="absolute top-2.5 left-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur-sm p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono">
          <span className="text-slate-500 px-1.5 flex items-center gap-0.5">
            <ZoomIn className="w-3 h-3 text-sky-400" />
            Scale:
          </span>
          <button
            onClick={() => setZoomLevel('auto')}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              zoomLevel === 'auto' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
            title="Auto-Fit dynamically stretches the waveform to make even tiny movements prominent"
          >
            Auto-Fit
          </button>
          <button
            onClick={() => setZoomLevel('5x')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              zoomLevel === '5x' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            5x Zoom
          </button>
          <button
            onClick={() => setZoomLevel('2x')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              zoomLevel === '2x' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            2x
          </button>
          <button
            onClick={() => setZoomLevel('1x')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              zoomLevel === '1x' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            1x (±3G)
          </button>
        </div>

        {/* Legend Overlay */}
        <div className="absolute top-2.5 right-3 flex items-center gap-3 text-[11px] font-mono bg-slate-900/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800">
          <span className="text-rose-400 font-bold">Magnitude ({unitStr})</span>
          <span className="text-sky-400">X ({unitStr})</span>
          <span className="text-amber-400">Y ({unitStr})</span>
          <span className="text-emerald-400">Z ({unitStr})</span>
        </div>

        <div className="absolute bottom-2 right-3 text-[10px] font-mono text-slate-500">
          25 Hz Sampling · 128 Sample Window (~5.12s)
        </div>
      </div>

      {/* Axis breakdown metrics with 3-decimal precision and live deltas */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono tabular-nums">
        <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-center gap-1">
            <span>X-Axis</span>
            <span className="text-[9px] text-slate-600">({unitStr})</span>
          </div>
          <div className="font-bold text-sky-400 mt-1 text-sm sm:text-base">
            {currentSample ? `${currentSample.x.toFixed(3)}` : '0.000'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Δ: {instantDelta.dx > 0 ? '+' : ''}
            {instantDelta.dx.toFixed(3)}
          </div>
        </div>

        <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-center gap-1">
            <span>Y-Axis</span>
            <span className="text-[9px] text-slate-600">({unitStr})</span>
          </div>
          <div className="font-bold text-amber-400 mt-1 text-sm sm:text-base">
            {currentSample ? `${currentSample.y.toFixed(3)}` : '0.000'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Δ: {instantDelta.dy > 0 ? '+' : ''}
            {instantDelta.dy.toFixed(3)}
          </div>
        </div>

        <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-center gap-1">
            <span>Z-Axis</span>
            <span className="text-[9px] text-slate-600">({unitStr})</span>
          </div>
          <div className="font-bold text-emerald-400 mt-1 text-sm sm:text-base">
            {currentSample ? `${currentSample.z.toFixed(3)}` : isGyro ? '0.000' : '1.000'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Δ: {instantDelta.dz > 0 ? '+' : ''}
            {instantDelta.dz.toFixed(3)}
          </div>
        </div>

        <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center justify-center gap-1">
            <span>Peak Vector |a|</span>
            <span className="text-[9px] text-slate-600">({unitStr})</span>
          </div>
          <div className="font-bold text-rose-400 mt-1 text-sm sm:text-base">
            {currentSample ? `${currentSample.magnitude.toFixed(3)}` : isGyro ? '0.000' : '1.000'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Δ: {instantDelta.dMag > 0 ? '+' : ''}
            {instantDelta.dMag.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
};
