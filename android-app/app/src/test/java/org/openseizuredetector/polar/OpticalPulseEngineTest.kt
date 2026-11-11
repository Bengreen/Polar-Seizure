package org.openseizuredetector.polar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openseizuredetector.polar.dsp.OpticalPulseEngine
import kotlin.math.PI
import kotlin.math.sin

class OpticalPulseEngineTest {

    @Test
    fun testRestingHeartRate100BpmDetection() {
        val engine = OpticalPulseEngine(sampleRateHz = 100.0)
        val targetBpm = 100.0
        val targetFreqHz = targetBpm / 60.0 // 1.667 Hz
        val sampleRate = 100.0
        val dtMs = 10L // 100 Hz = 10ms per sample

        var detectedBpm: Int? = null
        var lockAchieved = false

        // Generate 15 seconds of synthetic PPG (1500 samples)
        // Systolic peak with fundamental + small harmonic
        val startTime = 1000000L
        for (i in 0 until 1500) {
            val tSec = i / sampleRate
            val sampleTimeMs = startTime + (i * dtMs)

            // Synthetic optical PPG signal: baseline 900,000 + 10,000 amplitude cardiac wave
            val fundamental = 10000.0 * sin(2.0 * PI * targetFreqHz * tSec)
            val harmonic = 2500.0 * sin(4.0 * PI * targetFreqHz * tSec)
            val rawPpg = (900000.0 + fundamental + harmonic).toLong()

            val bpm = engine.processSample(rawPpg, sampleTimeMs)
            if (bpm != null) {
                detectedBpm = bpm
            }
            if (engine.isPulseLocked()) {
                lockAchieved = true
            }
        }

        assertNotNull("Expected BPM to be computed from 100 BPM synthetic PPG signal", detectedBpm)
        assertTrue("Pulse lock should be achieved within 15 seconds", lockAchieved)
        assertTrue(
            "Detected BPM ($detectedBpm) should be within 5% of target 100 BPM",
            detectedBpm in 95..105
        )
    }

    @Test
    fun testElevatedHeartRate130BpmDetection() {
        val engine = OpticalPulseEngine(sampleRateHz = 100.0)
        val targetBpm = 130.0
        val targetFreqHz = targetBpm / 60.0 // 2.167 Hz
        val sampleRate = 100.0
        val dtMs = 10L

        var detectedBpm: Int? = null
        val startTime = 2000000L
        for (i in 0 until 1500) {
            val tSec = i / sampleRate
            val sampleTimeMs = startTime + (i * dtMs)

            val fundamental = 12000.0 * sin(2.0 * PI * targetFreqHz * tSec)
            val rawPpg = (950000.0 + fundamental).toLong()

            val bpm = engine.processSample(rawPpg, sampleTimeMs)
            if (bpm != null) {
                detectedBpm = bpm
            }
        }

        assertNotNull("Expected BPM to be computed", detectedBpm)
        assertTrue(
            "Detected BPM ($detectedBpm) should track elevated 130 BPM within 5%",
            detectedBpm in 124..136
        )
    }

    @Test
    fun testResetClearsEngineState() {
        val engine = OpticalPulseEngine(sampleRateHz = 100.0)
        // Feed samples
        for (i in 0 until 500) {
            val tSec = i / 100.0
            val ppg = (800000.0 + 8000.0 * sin(2.0 * PI * 1.5 * tSec)).toLong()
            engine.processSample(ppg, 1000L + i * 10L)
        }

        engine.reset()
        assertEquals("Current BPM after reset should be 0", 0, engine.getLastBpm())
        assertEquals("Pulse should not be locked after reset", false, engine.isPulseLocked())
    }
}
