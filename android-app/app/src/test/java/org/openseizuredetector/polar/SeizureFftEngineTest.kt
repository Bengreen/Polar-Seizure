package org.openseizuredetector.polar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openseizuredetector.polar.dsp.SeizureFftEngine
import org.openseizuredetector.polar.model.SeizureAlarmState
import kotlin.math.PI
import kotlin.math.sin

class SeizureFftEngineTest {

    @Test
    fun testRestingStillnessYieldsNormalState() {
        val engine = SeizureFftEngine(windowSize = 128, sampleRateHz = 25.0)

        var lastResult = null as org.openseizuredetector.polar.dsp.SeizureAnalysisResult?
        // Feed 256 samples of stationary 1.0g gravity
        for (i in 0 until 256) {
            val res = engine.addSample(0.0, 0.0, 1.0)
            if (res != null) lastResult = res
        }

        assertTrue("Expected window to be processed", lastResult != null)
        assertEquals(SeizureAlarmState.NORMAL, lastResult!!.state)
        assertTrue(lastResult.totalPower < 0.05f)
    }

    @Test
    fun testWalkingMotion1HzDoesNotTriggerSeizureAlarm() {
        val engine = SeizureFftEngine(windowSize = 128, sampleRateHz = 25.0)

        var lastResult = null as org.openseizuredetector.polar.dsp.SeizureAnalysisResult?
        val sampleRate = 25.0
        val freq = 1.0 // 1 Hz walking step cadence

        for (i in 0 until 512) {
            val t = i / sampleRate
            val acc = 0.5 * sin(2.0 * PI * freq * t)
            val res = engine.addSample(acc, 0.0, 1.0)
            if (res != null) lastResult = res
        }

        assertTrue("Expected window to be processed", lastResult != null)
        // Ratio in 3-8 Hz band should be low for 1 Hz motion
        assertTrue("Expected 3-8Hz ratio < 0.4, got ${lastResult!!.fftRatio}", lastResult.fftRatio < 0.40f)
        assertEquals(SeizureAlarmState.NORMAL, lastResult.state)
    }

    @Test
    fun testRhythmicSeizureMotion5HzTriggersAlarm() {
        val engine = SeizureFftEngine(windowSize = 128, sampleRateHz = 25.0)

        var lastResult = null as org.openseizuredetector.polar.dsp.SeizureAnalysisResult?
        val sampleRate = 25.0
        val freq = 5.0 // 5 Hz clonic oscillatory motion

        for (i in 0 until 512) {
            val t = i / sampleRate
            val acc = 1.5 * sin(2.0 * PI * freq * t)
            val res = engine.addSample(acc, 0.0, 1.0)
            if (res != null) {
                lastResult = res
            }
        }

        assertTrue("Expected window to be processed", lastResult != null)
        assertTrue("Expected 3-8Hz ratio >= 0.5, got ${lastResult!!.fftRatio}", lastResult.fftRatio >= 0.50f)
        assertEquals(SeizureAlarmState.ALARM, lastResult.state)
    }
}
