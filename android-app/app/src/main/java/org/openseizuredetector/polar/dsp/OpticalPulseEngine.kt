package org.openseizuredetector.polar.dsp

import kotlin.math.abs

/**
 * Real-time optical pulse rate detector for 22 Hz / 50 Hz Photoplethysmography (PPG) streams.
 *
 * Polar 360 / Polar Loop streams raw optical readings (central green LED channels, 24-bit).
 * This engine applies:
 * 1. DC offset removal (high-pass filter / moving average subtraction).
 * 2. Low-pass smoothing filter (attenuates high-frequency noise).
 * 3. Dynamic peak detection with refractory period (250ms -> max ~240 BPM).
 * 4. Inter-beat interval (IBI) smoothing and BPM estimation.
 */
class OpticalPulseEngine(
    private val sampleRateHz: Double = 22.0
) {
    companion object {
        private const val MIN_BPM = 40.0
        private const val MAX_BPM = 220.0
        // Minimum interval between valid peaks in milliseconds (250ms = 240 BPM max)
        private const val MIN_PEAK_INTERVAL_MS = 250L
        // History buffer of recent inter-beat intervals (in ms) to compute moving average BPM
        private const val IBI_HISTORY_SIZE = 5
    }

    private var lastSampleTimeMs: Long = 0L
    private var lastPeakTimeMs: Long = 0L

    // Exponential moving average for baseline / DC drift removal
    private var dcBaseline: Double = 0.0
    private var isBaselineInitialized: Boolean = false

    // Exponential smoothing for high-frequency noise
    private var smoothedAc: Double = 0.0

    // Dynamic threshold tracking for peak detection
    private var peakThreshold: Double = 5000.0
    private var prevDerivative: Double = 0.0
    private var prevAc: Double = 0.0

    private val recentIbiMs = ArrayList<Long>()
    private var currentBpm: Int = 0

    /**
     * Ingests a raw optical sample (e.g. green channel photodiode amplitude)
     * and returns the current estimated BPM if valid, or null.
     */
    @Synchronized
    fun processSample(rawPpg: Long, timestampMs: Long = System.currentTimeMillis()): Int? {
        val sampleVal = rawPpg.toDouble()

        if (!isBaselineInitialized) {
            dcBaseline = sampleVal
            prevAc = 0.0
            smoothedAc = 0.0
            isBaselineInitialized = true
            lastSampleTimeMs = timestampMs
            return if (currentBpm > 0) currentBpm else null
        }

        // 1. DC drift removal: baseline tracks slow changes (alpha ~ 0.02)
        val alphaDc = 0.02
        dcBaseline = (alphaDc * sampleVal) + ((1.0 - alphaDc) * dcBaseline)
        val rawAc = sampleVal - dcBaseline

        // 2. High frequency smoothing (low pass filter: alpha ~ 0.35)
        val alphaLp = 0.35
        smoothedAc = (alphaLp * rawAc) + ((1.0 - alphaLp) * smoothedAc)

        // 3. Peak detection using slope zero-crossing (inflection point from positive to negative)
        val derivative = smoothedAc - prevAc
        val isLocalMax = prevDerivative > 0.0 && derivative <= 0.0

        if (isLocalMax && smoothedAc > (peakThreshold * 0.4)) {
            val intervalMs = timestampMs - lastPeakTimeMs
            val instantBpm = if (intervalMs > 0) (60000.0 / intervalMs) else 0.0

            if (lastPeakTimeMs > 0 && intervalMs >= MIN_PEAK_INTERVAL_MS && instantBpm in MIN_BPM..MAX_BPM) {
                recentIbiMs.add(intervalMs)
                if (recentIbiMs.size > IBI_HISTORY_SIZE) {
                    recentIbiMs.removeAt(0)
                }

                // Compute smoothed heart rate average from recent valid intervals
                val avgIbi = recentIbiMs.average()
                if (avgIbi > 0.0) {
                    currentBpm = (60000.0 / avgIbi).toInt()
                }

                // Adaptively update peak threshold
                peakThreshold = (0.7 * peakThreshold) + (0.3 * smoothedAc)
                lastPeakTimeMs = timestampMs
            } else if (lastPeakTimeMs == 0L || (timestampMs - lastPeakTimeMs) > 3000L) {
                // First peak or long silence/disconnection reset
                lastPeakTimeMs = timestampMs
                peakThreshold = abs(smoothedAc).coerceAtLeast(1000.0)
            }
        } else {
            // Decay threshold slowly when no peaks occur
            peakThreshold *= 0.998
        }

        prevDerivative = derivative
        prevAc = smoothedAc
        lastSampleTimeMs = timestampMs

        // If no peak detected for > 4.5 seconds, clear heart rate
        if (lastPeakTimeMs > 0 && (timestampMs - lastPeakTimeMs) > 4500L) {
            currentBpm = 0
            recentIbiMs.clear()
        }

        return if (currentBpm in 30..240) currentBpm else null
    }

    @Synchronized
    fun isPulseLocked(): Boolean = recentIbiMs.size >= IBI_HISTORY_SIZE && currentBpm in 40..200

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
        peakThreshold = 5000.0
        recentIbiMs.clear()
    }
}
