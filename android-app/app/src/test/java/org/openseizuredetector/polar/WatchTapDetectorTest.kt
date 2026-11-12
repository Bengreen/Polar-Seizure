package org.openseizuredetector.polar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openseizuredetector.polar.dsp.WatchTapDetector

class WatchTapDetectorTest {

    @Test
    fun testNormalDailyMovementsDoNotTriggerTap() {
        val detector = WatchTapDetector()
        var triggered = false

        // Simulate 20 seconds of walking and moving arms at 25Hz (dt = 40ms)
        var time = 1000L
        for (i in 0 until 500) {
            time += 40L
            // Smooth sinusoidal motion with moderate acceleration (0.8g to 1.3g)
            val smoothWave = 0.3 * kotlin.math.sin(i * 0.15)
            if (detector.addSample(time, 0.0, 0.0, 1.0 + smoothWave)) {
                triggered = true
            }
        }

        assertFalse("Smooth movement should not trigger tap gesture", triggered)
        assertEquals(0, detector.getPendingTapCount())
    }

    @Test
    fun testDeliberateTripleTapTriggersPanic() {
        val detector = WatchTapDetector()
        var triggered = false
        var time = 2000L

        // Resting baseline
        for (i in 0 until 20) {
            time += 40L
            detector.addSample(time, 0.0, 0.0, 1.0)
        }

        // --- Tap 1 (at time = 2840ms) ---
        time += 40L
        detector.addSample(time, 0.2, 0.3, 1.9) // Sharp tap spike
        time += 40L
        detector.addSample(time, 0.0, 0.0, 1.0) // Settle back
        assertEquals(1, detector.getPendingTapCount())

        // Wait 320ms (8 samples)
        for (i in 0 until 8) {
            time += 40L
            detector.addSample(time, 0.0, 0.0, 1.0)
        }

        // --- Tap 2 ---
        time += 40L
        detector.addSample(time, 0.1, 0.2, 1.85) // Second tap spike
        time += 40L
        detector.addSample(time, 0.0, 0.0, 1.0) // Settle
        assertEquals(2, detector.getPendingTapCount())

        // Wait 360ms (9 samples)
        for (i in 0 until 9) {
            time += 40L
            detector.addSample(time, 0.0, 0.0, 1.0)
        }

        // --- Tap 3 ---
        time += 40L
        if (detector.addSample(time, 0.3, 0.1, 2.0)) { // Third tap spike
            triggered = true
        }

        assertTrue("Verified deliberate triple tap must trigger panic gesture", triggered)
        assertEquals(0, detector.getPendingTapCount())
    }

    @Test
    fun testDoubleTapWithoutThirdTapTimesOut() {
        val detector = WatchTapDetector(maxInterTapIntervalMs = 600L)
        var triggered = false
        var time = 2000L

        // Tap 1
        time += 40L
        detector.addSample(time, 0.0, 0.0, 2.0)
        time += 40L
        detector.addSample(time, 0.0, 0.0, 1.0)
        assertEquals(1, detector.getPendingTapCount())

        // Wait 300ms
        for (i in 0 until 7) {
            time += 40L
            detector.addSample(time, 0.0, 0.0, 1.0)
        }

        // Tap 2
        time += 40L
        detector.addSample(time, 0.0, 0.0, 2.0)
        time += 40L
        detector.addSample(time, 0.0, 0.0, 1.0)
        assertEquals(2, detector.getPendingTapCount())

        // Wait 900ms without a 3rd tap (exceeds 600ms timeout)
        for (i in 0 until 25) {
            time += 40L
            if (detector.addSample(time, 0.0, 0.0, 1.0)) {
                triggered = true
            }
        }

        assertFalse("Double tap alone must not trigger", triggered)
        assertEquals("Pending taps should reset after timeout", 0, detector.getPendingTapCount())
    }

    @Test
    fun testRapidVibrationOrShakingRejectsFalseTripleTap() {
        val detector = WatchTapDetector(minInterTapIntervalMs = 160L)
        var triggered = false
        var time = 2000L

        // Simulate 8Hz high-frequency vibration/tremor (period = 125ms < 160ms min interval)
        for (i in 0 until 100) {
            time += 40L
            val spike = if (i % 3 == 0) 2.2 else 0.5
            if (detector.addSample(time, 0.0, 0.0, spike)) {
                triggered = true
            }
        }

        assertFalse("Rapid vibration (<160ms interval) must be rejected to prevent false panic", triggered)
    }
}
