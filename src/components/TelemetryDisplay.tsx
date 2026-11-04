/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { SensorSample } from '../types/seizure';
import { Heart, Gauge, Wifi, Bluetooth, Radio } from 'lucide-react';

interface TelemetryDisplayProps {
  samples: SensorSample[];
  currentSample: SensorSample | null;
  measuredSampleRate: number;
  isBleConnected: boolean;
  deviceName: string | null;
  heartRate?: number;
  batteryLevel?: number | null;
}

export const TelemetryDisplay: React.FC<TelemetryDisplayProps> = ({
  samples,
  currentSample,
  measuredSampleRate,
  isBleConnected,
  deviceName,
  heartRate,
  batteryLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render 3D Acceleration Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Horizontal baseline (1G = height/2)
    const midY = height / 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Scale: 1G = 30 pixels
    const scale = 32;

    if (samples.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText('Awaiting live sensor stream...', 16, midY - 6);
      return;
    }

    const step = width / (samples.length - 1);

    // Draw Magnitude Line (Rose)
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    samples.forEach((s, idx) => {
      const x = idx * step;
      // Magnitude typically around 1.0G, map 1.0G to midY, higher values go up
      const y = midY - (s.magnitude - 1.0) * scale;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw X Axis (Cyan - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = midY - s.x * scale;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Y Axis (Amber - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.lineWidth = 1;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = midY - s.y * scale;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Z Axis (Emerald - faint)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 1;
    samples.forEach((s, idx) => {
      const x = idx * step;
      const y = midY - (s.z - 1.0) * scale;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [samples]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
      {/* Header telemetry strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {isBleConnected ? (
            <Bluetooth className="w-4 h-4 text-sky-400" />
          ) : (
            <Radio className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-sm font-semibold text-white">
            {deviceName || (isBleConnected ? 'Polar BLE Device' : 'Synthetic Stream')}
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {measuredSampleRate.toFixed(1)} Hz
          </span>
        </div>

        {/* Vital stats row */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            <span>{heartRate ? `${heartRate} bpm` : '-- bpm'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span>
              |a|: {currentSample ? currentSample.magnitude.toFixed(2) : '1.00'} G
            </span>
          </div>

          {batteryLevel !== undefined && batteryLevel !== null && (
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className={`w-2 h-2 rounded-full ${batteryLevel < 20 ? 'bg-rose-500' : 'bg-emerald-400'}`} />
              <span>{batteryLevel}%</span>
            </div>
          )}
        </div>
      </div>

      {/* 3D Waveform Canvas */}
      <div className="relative w-full h-44 bg-slate-950/70 rounded-xl overflow-hidden border border-slate-800/60">
        <canvas
          ref={canvasRef}
          width={700}
          height={176}
          className="w-full h-full block"
        />

        {/* Legend Overlay */}
        <div className="absolute top-2.5 right-3 flex items-center gap-3 text-[11px] font-mono bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800">
          <span className="text-rose-400 font-semibold">Magnitude</span>
          <span className="text-sky-400/80">X</span>
          <span className="text-amber-400/80">Y</span>
          <span className="text-emerald-400/80">Z</span>
        </div>

        <div className="absolute bottom-2 left-3 text-[10px] font-mono text-slate-500">
          25 Hz Sampling · 128 Sample Window (~5.12s)
        </div>
      </div>

      {/* Axis breakdown metrics */}
      <div className="grid grid-cols-4 gap-2 mt-3 pt-2 text-center text-xs font-mono tabular-nums">
        <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">X-Axis</div>
          <div className="font-semibold text-sky-400 mt-0.5">
            {currentSample ? `${currentSample.x.toFixed(2)} G` : '0.00 G'}
          </div>
        </div>
        <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Y-Axis</div>
          <div className="font-semibold text-amber-400 mt-0.5">
            {currentSample ? `${currentSample.y.toFixed(2)} G` : '0.00 G'}
          </div>
        </div>
        <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Z-Axis</div>
          <div className="font-semibold text-emerald-400 mt-0.5">
            {currentSample ? `${currentSample.z.toFixed(2)} G` : '1.00 G'}
          </div>
        </div>
        <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Peak Vector</div>
          <div className="font-semibold text-rose-400 mt-0.5">
            {currentSample ? `${currentSample.magnitude.toFixed(2)} G` : '1.00 G'}
          </div>
        </div>
      </div>
    </div>
  );
};
