/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DetectionConfig, SpectrumAnalysis } from '../types/seizure';

/**
 * Fast Fourier Transform (FFT) and OpenSeizureDetector Spectral Engine.
 * Implements Radix-2 Cooley-Tukey FFT on 3D accelerometer signals with
 * Hanning windowing, DC gravity rejection, 3-8 Hz ROI calculation, and ratio metrics.
 */

// Bit-reversal permutation for Radix-2 FFT
function bitReverse(n: number, bits: number): number {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (n & 1);
    n >>= 1;
  }
  return reversed;
}

/**
 * In-place Radix-2 Cooley-Tukey FFT
 * real: array of length N (power of 2)
 * imag: array of length N (initialized to 0)
 */
export function computeRadix2FFT(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  const levels = Math.log2(n);

  if (Math.pow(2, levels) !== n) {
    throw new Error('FFT length must be a power of 2');
  }

  // Bit reversal ordering
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, levels);
    if (j > i) {
      const tempReal = real[i];
      const tempImag = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempReal;
      imag[j] = tempImag;
    }
  }

  // Cooley-Tukey butterfly computations
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angleStep = (-2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let j = i; j < i + halfSize; j++) {
        const k = j - i;
        const angle = k * angleStep;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const matchIdx = j + halfSize;
        const tr = cos * real[matchIdx] - sin * imag[matchIdx];
        const ti = sin * real[matchIdx] + cos * imag[matchIdx];

        real[matchIdx] = real[j] - tr;
        imag[matchIdx] = imag[j] - ti;
        real[j] += tr;
        imag[j] += ti;
      }
    }
  }
}

/**
 * Pre-computed Hanning Window table for N=128 to save CPU cycles on mobile
 */
const hanningCache = new Map<number, Float32Array>();

function getHanningWindow(length: number): Float32Array {
  let cached = hanningCache.get(length);
  if (!cached) {
    cached = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      // 0.5 * (1 - cos(2*pi*i / (N-1)))
      cached[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }
    hanningCache.set(length, cached);
  }
  return cached;
}

/**
 * Performs OpenSeizureDetector FFT spectral analysis on a 128-sample window (25 Hz)
 */
export function analyzeAccelerometerWindow(
  magnitudes: number[],
  config: DetectionConfig
): SpectrumAnalysis {
  const n = config.windowSize; // 128
  const sampleRate = config.sampleRate; // 25 Hz
  const nyquistIdx = n / 2; // 64 positive frequency bins
  const binResolution = sampleRate / n; // 25 / 128 = 0.1953125 Hz

  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const window = getHanningWindow(n);

  // 1. Calculate DC mean to subtract static 1G gravity bias
  let mean = 0;
  const count = Math.min(magnitudes.length, n);
  for (let i = 0; i < count; i++) {
    mean += magnitudes[i];
  }
  mean = count > 0 ? mean / count : 0;

  // 2. High-pass DC subtraction and Hanning window application
  for (let i = 0; i < n; i++) {
    const rawVal = i < magnitudes.length ? magnitudes[i] : 0;
    const zeroMeanVal = config.highPassCutoff ? rawVal - mean : rawVal;
    real[i] = zeroMeanVal * window[i];
    imag[i] = 0;
  }

  // 3. Compute Radix-2 FFT
  computeRadix2FFT(real, imag);

  // 4. Calculate Power Spectrum Density and Frequency bins
  const frequencies: number[] = [];
  const powers: number[] = [];

  let roiPower = 0;
  let totalPower = 0;
  let peakPowerInRoi = -1;
  let peakFreqInRoi = 0;

  for (let k = 0; k <= nyquistIdx; k++) {
    const freq = k * binResolution;
    frequencies.push(Math.round(freq * 100) / 100);

    // Magnitude squared normalized
    let power = (real[k] * real[k] + imag[k] * imag[k]) / (n * n);

    // Zero out DC bin (0 Hz) to eliminate baseline drift
    if (k === 0) {
      power = 0;
    }

    powers.push(power);
    totalPower += power;

    // Check if within 3 - 8 Hz Region of Interest
    if (freq >= config.roiMinFreq && freq <= config.roiMaxFreq) {
      roiPower += power;
      if (power > peakPowerInRoi) {
        peakPowerInRoi = power;
        peakFreqInRoi = freq;
      }
    }
  }

  // 5. Ratio calculation (ROI power / Total power)
  const ratio = totalPower > 0.00001 ? Math.min(1.0, roiPower / totalPower) : 0;

  // 6. Threshold evaluation
  const isSeizureCandidate =
    roiPower >= config.roiPowerThreshold && ratio >= config.ratioThreshold;

  return {
    frequencies,
    powers,
    roiPower: Math.round(roiPower * 10) / 10,
    totalPower: Math.round(totalPower * 10) / 10,
    ratio: Math.round(ratio * 1000) / 1000,
    peakFrequency: Math.round(peakFreqInRoi * 10) / 10,
    isSeizureCandidate,
  };
}
