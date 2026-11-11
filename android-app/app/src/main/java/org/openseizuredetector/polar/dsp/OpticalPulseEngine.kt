package org.openseizuredetector.polar.dsp

import kotlin.math.PI
import kotlin.math.abs

/**
 * Real-time optical pulse rate detector for 22 Hz / 50 Hz / 100 Hz Photoplethysmography (PPG) streams.
 *
 * Polar Loop Gen2 / Polar 360 streams raw optical readings (central green LED channels, 24-bit).
 * This engine applies:
 * 1. DC offset removal (high-pass filter tracking baseline drift ~0.7 Hz).
 * 2. Low-pass smoothing filter (attenuates high-frequency sensor noise and dicrotic harmonics ~3.0 Hz).
 * 3. Dynamic peak detection with refractory period (270ms -> max ~220 BPM).
 * 4. Inter-beat interval (IBI) median filtering and continuous BPM estimation.
 */
class OpticalPulseEngine(
    private var sampleRateHz: Double = 100.0
) {
    companion object {
        private const val MIN_BPM = 40.0
        private const val MAX_BPM = 180.0
        // Minimum interval between valid peaks in milliseconds (330ms = 181 BPM max).
        // Prevents dicrotic notch / diastolic secondary wave reflection from triggering false double counts (~200 BPM).
        private const val MIN_PEAK_INTERVAL_MS = 330L
        // History buffer of recent inter-beat intervals (in ms) to compute median BPM
        private const val IBI_HISTORY_SIZE = 5
    }

    private var alphaDc: Double = calculateAlpha(0.7, sampleRateHz)
    private var alphaLp: Double = calculateAlpha(2.6, sampleRateHz)

    private var lastSampleTimeMs: Long = 0L
    private var lastPeakTimeMs: Long = 0L

    // Exponential moving average for baseline / DC drift removal
    private var dcBaseline: Double = 0.0
    private var isBaselineInitialized: Boolean = false

    // Exponential smoothing for high-frequency noise and dicrotic harmonics
    private var smoothedAc: Double = 0.0

    // Dynamic threshold tracking for peak detection
    private var peakThreshold: Double = 3000.0
    private var prevDerivative: Double = 0.0
    private var prevAc: Double = 0.0

    private val recentIbiMs = ArrayList<Long>()
    private var currentBpm: Int = 0

    @Synchronized
    fun setSampleRate(rateHz: Double) {
        if (rateHz > 0.0 && rateHz != sampleRateHz) {
            sampleRateHz = rateHz
            alphaDc = calculateAlpha(0.7, sampleRateHz)
            alphaLp = calculateAlpha(2.6, sampleRateHz)
        }
    }

    private fun calculateAlpha(cutoffHz: Double, rateHz: Double): Double {
        val dt = 1.0 / rateHz
        val rc = 1.0 / (2.0 * PI * cutoffHz)
        return (dt / (rc + dt)).coerceIn(0.01, 0.95)
    }

    /**
     * Ingests a raw optical sample (e.g. green channel photodiode amplitude)
     * with its interpolated or actual timestamp and returns the current estimated BPM if valid.
     */
    @Synchronized
    fun processSample(rawPpg: Long, timestampMs: Long = System.currentTimeMillis()): Int? {
        val sampleVal = rawPpg.toDouble()

        if (!isBaselineInitialized) {
            dcBaseline = sampleVal
            prevAc = 0.0
            smoothedAc = 0.0
            prevDerivative = 0.0
            isBaselineInitialized = true
            lastSampleTimeMs = timestampMs
            return if (currentBpm > 0) currentBpm else null
        }

        // 1. DC drift removal: baseline tracks slow baseline shifts (~0.7 Hz)
        dcBaseline = (alphaDc * sampleVal) + ((1.0 - alphaDc) * dcBaseline)
        val rawAc = sampleVal - dcBaseline

        // 2. High frequency smoothing (low pass filter ~3.0 Hz)
        smoothedAc = (alphaLp * rawAc) + ((1.0 - alphaLp) * smoothedAc)

        // 3. Peak detection using slope zero-crossing (inflection point from positive to negative)
        val derivative = smoothedAc - prevAc
        val isLocalMax = prevDerivative > 0.0 && derivative <= 0.0

        if (isLocalMax && smoothedAc > (peakThreshold * 0.35)) {
            val intervalMs = timestampMs - lastPeakTimeMs
            val instantBpm = if (intervalMs > 0) (60000.0 / intervalMs) else 0.0

            if (lastPeakTimeMs > 0 && intervalMs >= MIN_PEAK_INTERVAL_MS && instantBpm in MIN_BPM..MAX_BPM) {
                recentIbiMs.add(intervalMs)
                if (recentIbiMs.size > IBI_HISTORY_SIZE) {
                    recentIbiMs.removeAt(0)
                }

                // Compute heart rate using median of recent intervals to be resilient against occasional missed beats
                val sortedIbi = recentIbiMs.sorted()
                val medianIbi = sortedIbi[sortedIbi.size / 2].toDouble()
                if (medianIbi > 0.0) {
                    currentBpm = (60000.0 / medianIbi).toInt()
                }

                // Adaptively update peak threshold
                peakThreshold = (0.75 * peakThreshold) + (0.25 * smoothedAc)
                lastPeakTimeMs = timestampMs
            } else if (lastPeakTimeMs == 0L || (timestampMs - lastPeakTimeMs) > 3000L) {
                // First peak or reset after long gap
                lastPeakTimeMs = timestampMs
                peakThreshold = abs(smoothedAc).coerceAtLeast(1000.0)
            }
        } else {
            // Decay threshold smoothly when no peaks occur
            peakThreshold *= 0.999
        }

        prevDerivative = derivative
        prevAc = smoothedAc
        lastSampleTimeMs = timestampMs

        // If no peak detected for > 6.0 seconds, clear heart rate
        if (lastPeakTimeMs > 0 && (timestampMs - lastPeakTimeMs) > 6000L) {
            currentBpm = 0
            recentIbiMs.clear()
        }

        return if (currentBpm in 35..230) currentBpm else null
    }

    @Synchronized
    fun isPulseLocked(): Boolean = recentIbiMs.size >= 4 && currentBpm in 40..210

    @Synchronized
    fun getLastBpm(): Int = currentBpm

    @Synchronized
    fun reset() {
        isBaselineInitialized = false
        dcBaseline = 0.0
        smoothedAc = 0.0
        prevDerivative = 0.0
        prevAc = 0.0
        lastPeakTimeMs = 0L
        currentBpm = 0
        peakThreshold = 3000.0
        recentIbiMs.clear()
    }
}
