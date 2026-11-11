package org.openseizuredetector.polar.dsp

import kotlin.math.sqrt

/**
 * High-G Fall / Impact Detector (PRD-003 §7.2).
 *
 * Clinical Context:
 * Atonic seizures ("drop attacks"), tonic stiffening, and acute convulsive falls often produce
 * sudden high-G kinetic impacts (typically >3.5g) followed by motionless flaccidity or unconsciousness.
 *
 * Algorithm:
 * 1. Impact Detection: Continuously track instantaneous acceleration magnitude:
 *    |a| = sqrt(gx^2 + gy^2 + gz^2).
 *    Flag an impact event when |a| >= impactThresholdG (default: 3.5g).
 * 2. Post-Impact Inactivity Window:
 *    Once impact is flagged, track subsequent acceleration variance over a verification window
 *    (postImpactWindowMs, default: 10,000ms = 10s).
 * 3. Fall Confirmation:
 *    If the wearer remains motionless (moving variance < immobilityVarianceThresholdG2, default: 0.025g^2)
 *    for >= immobilityRequiredMs (default: 10,000ms), confirm a HIGH_G fall event.
 *    If normal intentional movement resumes before 10s elapses, abort/reset the fall candidate.
 */
class HighGFallDetector(
    val impactThresholdG: Double = 3.5,
    val immobilityVarianceThresholdG2: Double = 0.025,
    val immobilityRequiredMs: Long = 10_000L,
    val maxObservationWindowMs: Long = 15_000L
) {
    enum class State {
        MONITORING,
        POST_IMPACT_OBSERVATION,
        FALL_CONFIRMED
    }

    private var currentState = State.MONITORING
    private var impactTimestampMs: Long = 0L
    private var peakImpactG: Double = 0.0

    // Short-term sliding variance window for immobility evaluation (last ~25 samples at 25Hz = 1s)
    private val bufferSize = 25
    private val magnitudeBuffer = DoubleArray(bufferSize)
    private var bufferCount = 0
    private var writeIdx = 0

    fun getState(): State = currentState
    fun getPeakImpactG(): Double = peakImpactG

    fun reset() {
        currentState = State.MONITORING
        impactTimestampMs = 0L
        peakImpactG = 0.0
        bufferCount = 0
        writeIdx = 0
    }

    /**
     * Feed an acceleration sample (gx, gy, gz in g units) at the given epoch millisecond timestamp.
     * Returns true if a high-G fall has just been confirmed.
     */
    fun addSample(timestampMs: Long, gx: Double, gy: Double, gz: Double): Boolean {
        val magnitude = sqrt(gx * gx + gy * gy + gz * gz)

        // Store sample in circular buffer for recent variance
        magnitudeBuffer[writeIdx] = magnitude
        writeIdx = (writeIdx + 1) % bufferSize
        if (bufferCount < bufferSize) bufferCount++

        when (currentState) {
            State.MONITORING -> {
                if (magnitude >= impactThresholdG) {
                    currentState = State.POST_IMPACT_OBSERVATION
                    impactTimestampMs = timestampMs
                    peakImpactG = magnitude
                }
            }

            State.POST_IMPACT_OBSERVATION -> {
                if (magnitude > peakImpactG) {
                    peakImpactG = magnitude
                }

                val elapsedSinceImpact = timestampMs - impactTimestampMs

                // If observation timed out beyond 15s without confirming immobility, reset
                if (elapsedSinceImpact > maxObservationWindowMs) {
                    reset()
                    return false
                }

                // Check recent movement variance over the last second
                val variance = calculateBufferVariance()

                // If active intentional motion (>0.15g variance) is observed after impact, wearer is moving/conscious
                if (elapsedSinceImpact > 2000L && variance > 0.15) {
                    reset()
                    return false
                }

                // If elapsed motionless time meets threshold and variance remains low
                if (elapsedSinceImpact >= immobilityRequiredMs) {
                    if (variance <= immobilityVarianceThresholdG2) {
                        currentState = State.FALL_CONFIRMED
                        return true
                    } else {
                        reset()
                    }
                }
            }

            State.FALL_CONFIRMED -> {
                // Remains confirmed until explicitly reset
            }
        }

        return false
    }

    private fun calculateBufferVariance(): Double {
        if (bufferCount < 2) return 0.0
        var sum = 0.0
        for (i in 0 until bufferCount) {
            sum += magnitudeBuffer[i]
        }
        val mean = sum / bufferCount

        var sumSqDiff = 0.0
        for (i in 0 until bufferCount) {
            val diff = magnitudeBuffer[i] - mean
            sumSqDiff += diff * diff
        }
        return sumSqDiff / bufferCount
    }
}
