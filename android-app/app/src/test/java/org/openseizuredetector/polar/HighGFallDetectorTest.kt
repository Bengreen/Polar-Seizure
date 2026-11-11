package org.openseizuredetector.polar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openseizuredetector.polar.dsp.HighGFallDetector

class HighGFallDetectorTest {

    @Test
    fun testNormalDailyMotionDoesNotTriggerFall() {
        val detector = HighGFallDetector()
        var fallTriggered = false

        // Simulate 20 seconds of walking / hand gesturing (0.8g to 1.8g)
        var time = 1000L
        for (i in 0 until 500) { // 25Hz -> 20s
            time += 40L
            val wave = 0.5 * kotlin.math.sin(i * 0.2)
            if (detector.addSample(time, 0.0, 0.0, 1.0 + wave)) {
                fallTriggered = true
            }
        }

        assertFalse("Normal motion should not trigger fall", fallTriggered)
        assertEquals(HighGFallDetector.State.MONITORING, detector.getState())
    }

    @Test
    fun testHighImpactFollowedByProlongedImmobilityTriggersFall() {
        val detector = HighGFallDetector(
            impactThresholdG = 3.5,
            immobilityRequiredMs = 10_000L
        )

        var time = 1000L
        // 1. Initial 2 seconds of stationary baseline
        for (i in 0 until 50) {
            time += 40L
            detector.addSample(time, 0.0, 0.0, 1.0)
        }

        // 2. High-G impact spike (4.2g drop)
        time += 40L
        val impactTriggered = detector.addSample(time, 2.0, 2.5, 2.7) // ~4.18g
        assertFalse("Fall should not immediately confirm on impact (requires immobility window)", impactTriggered)
        assertEquals(HighGFallDetector.State.POST_IMPACT_OBSERVATION, detector.getState())

        // 3. Post-impact flaccidity / motionless stillness (1.0g resting on floor) for 10.5 seconds
        var confirmedFall = false
        for (i in 0 until 265) { // 265 * 40ms = 10.6s
            time += 40L
            // Tiny sensor noise (~0.005g)
            val noise = 0.005 * kotlin.math.sin(i.toDouble())
            if (detector.addSample(time, 0.0, noise, 1.0)) {
                confirmedFall = true
                break
            }
        }

        assertTrue("Fall should confirm after 10s immobility post-impact", confirmedFall)
        assertEquals(HighGFallDetector.State.FALL_CONFIRMED, detector.getState())
        assertTrue("Recorded peak impact >= 3.5g", detector.getPeakImpactG() >= 3.5)
    }

    @Test
    fun testHighImpactFollowedByImmediateRecoveryDoesNotTriggerFall() {
        val detector = HighGFallDetector(
            impactThresholdG = 3.5,
            immobilityRequiredMs = 10_000L
        )

        var time = 1000L
        // 1. Impact spike
        time += 40L
        detector.addSample(time, 0.0, 0.0, 4.0)
        assertEquals(HighGFallDetector.State.POST_IMPACT_OBSERVATION, detector.getState())

        // 2. Wearer gets up and moves around vigorously at 3 seconds post-impact
        var confirmed = false
        for (i in 0 until 100) { // 4 seconds
            time += 40L
            val wave = 0.8 * kotlin.math.sin(i * 0.5) // Active movement
            if (detector.addSample(time, wave, 0.0, 1.0 + wave)) {
                confirmed = true
            }
        }

        assertFalse("Active movement post-impact must cancel candidate fall", confirmed)
        assertEquals(HighGFallDetector.State.MONITORING, detector.getState())
    }
}
