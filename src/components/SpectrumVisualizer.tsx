/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { DetectionConfig, SpectrumAnalysis } from '../types/seizure';
import { BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';

interface SpectrumVisualizerProps {
  analysis: SpectrumAnalysis | null;
  config: DetectionConfig;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  analysis,
  config,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const { frequencies, powers } = analysis;
    if (frequencies.length === 0 || powers.length === 0) return;

    const maxFreq = frequencies[frequencies.length - 1] || 12.5;
    const paddingLeft = 40;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - 16;
    const plotHeight = height - paddingBottom - 16;

    // Find max power for dynamic vertical scaling (minimum ceiling 200)
    let maxPower = Math.max(...powers, 150);

    // 1. Draw 3.0 Hz to 8.0 Hz ROI Highlighted Shaded Band
    const roiStartFreq = config.roiMinFreq; // 3.0 Hz
    const roiEndFreq = config.roiMaxFreq;   // 8.0 Hz

    const roiStartX = paddingLeft + (roiStartFreq / maxFreq) * plotWidth;
    const roiEndX = paddingLeft + (roiEndFreq / maxFreq) * plotWidth;
    const roiBandWidth = roiEndX - roiStartX;

    // Shaded ROI background
    ctx.fillStyle = analysis.isSeizureCandidate
      ? 'rgba(244, 63, 94, 0.18)'
      : 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(roiStartX, 16, roiBandWidth, plotHeight);

    // ROI boundary dashed lines
    ctx.strokeStyle = analysis.isSeizureCandidate
      ? 'rgba(244, 63, 94, 0.6)'
      : 'rgba(56, 189, 248, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(roiStartX, 16);
    ctx.lineTo(roiStartX, 16 + plotHeight);
    ctx.moveTo(roiEndX, 16);
    ctx.lineTo(roiEndX, 16 + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // 2. Draw Grid & Axes
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // X Axis
    ctx.moveTo(paddingLeft, 16 + plotHeight);
    ctx.lineTo(paddingLeft + plotWidth, 16 + plotHeight);
    // Y Axis
    ctx.moveTo(paddingLeft, 16);
    ctx.lineTo(paddingLeft, 16 + plotHeight);
    ctx.stroke();

    // Frequency markers along X-axis
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';

    for (let f = 0; f <= 12; f += 2) {
      const x = paddingLeft + (f / maxFreq) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, 16 + plotHeight);
      ctx.lineTo(x, 16 + plotHeight + 4);
      ctx.stroke();
      ctx.fillText(`${f}Hz`, x, 16 + plotHeight + 16);
    }

    // Y Axis label
    ctx.save();
    ctx.translate(14, 16 + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Power Density', 0, 0);
    ctx.restore();

    // 3. Draw FFT Power Spectrum Curve / Bars
    const barWidth = Math.max(2, plotWidth / powers.length - 2);

    powers.forEach((power, idx) => {
      const freq = frequencies[idx];
      const x = paddingLeft + (freq / maxFreq) * plotWidth;
      const barH = (power / maxPower) * plotHeight;
      const y = 16 + plotHeight - barH;

      const isInRoi = freq >= roiStartFreq && freq <= roiEndFreq;

      if (isInRoi) {
        ctx.fillStyle = analysis.isSeizureCandidate ? '#f43f5e' : '#38bdf8';
      } else {
        ctx.fillStyle = '#334155';
      }

      ctx.fillRect(x - barWidth / 2, y, barWidth, barH);
    });

    // 4. Highlight Peak Frequency in ROI
    if (analysis.peakFrequency > 0 && analysis.roiPower > 10) {
      const peakX = paddingLeft + (analysis.peakFrequency / maxFreq) * plotWidth;
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(peakX, 16 + 10, 4, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(`Peak: ${analysis.peakFrequency.toFixed(1)}Hz`, peakX, 16);
    }
  }, [analysis, config]);

  const isSeizure = analysis?.isSeizureCandidate ?? false;
  const ratio = analysis?.ratio ?? 0;
  const roiPower = analysis?.roiPower ?? 0;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold text-white">
            FFT Power Spectrum (0–12.5 Hz)
          </h2>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            ROI: {config.roiMinFreq.toFixed(1)}–{config.roiMaxFreq.toFixed(1)} Hz
          </span>
        </div>

        {/* Algorithm Decision Indicator */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {isSeizure ? (
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/30">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>TREMOR PATTERN DETECTED</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>NON-SEIZURE SPECTRUM</span>
            </div>
          )}
        </div>
      </div>

      {/* Canvas Spectrum Visualizer */}
      <div className="relative w-full h-52 bg-slate-950/70 rounded-xl overflow-hidden border border-slate-800/60 mb-4">
        <canvas
          ref={canvasRef}
          width={700}
          height={208}
          className="w-full h-full block"
        />

        {/* ROI Overlay Banner */}
        <div className="absolute top-2.5 left-12 text-[11px] font-mono bg-slate-900/85 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-800 text-slate-300">
          Shaded zone: <span className="text-rose-400 font-semibold">3–8 Hz Clonic Region of Interest</span>
        </div>
      </div>

      {/* OpenSeizureDetector Primary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
        {/* Metric 1: ROI Power */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1 flex justify-between">
            <span>ROI Power (3–8 Hz)</span>
            <span className="text-slate-500">Thresh: {config.roiPowerThreshold}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${roiPower >= config.roiPowerThreshold ? 'text-rose-400' : 'text-slate-200'}`}>
              {roiPower.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">mG²</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${roiPower >= config.roiPowerThreshold ? 'bg-rose-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.min(100, (roiPower / config.roiPowerThreshold) * 75)}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Spectrum Ratio */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1 flex justify-between">
            <span>ROI-to-Total Ratio</span>
            <span className="text-slate-500">Thresh: {config.ratioThreshold.toFixed(2)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${ratio >= config.ratioThreshold ? 'text-rose-400' : 'text-slate-200'}`}>
              {(ratio * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">ratio</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${ratio >= config.ratioThreshold ? 'bg-rose-500' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, (ratio / 1.0) * 100)}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Dominant Tremor Frequency */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1">
            <span>Peak Tremor Freq</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${analysis && analysis.peakFrequency >= 3 && analysis.peakFrequency <= 8 && isSeizure ? 'text-rose-400' : 'text-slate-300'}`}>
              {analysis && analysis.peakFrequency > 0 ? `${analysis.peakFrequency.toFixed(1)} Hz` : '-- Hz'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 truncate">
            {isSeizure ? 'Characteristic clonic convulsion' : 'Normal voluntary motion'}
          </div>
        </div>
      </div>
    </div>
  );
};
