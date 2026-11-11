package org.openseizuredetector.polar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openseizuredetector.polar.dsp.SeizureAnalysisResult
import org.openseizuredetector.polar.dsp.SeizureFftEngine
import org.openseizuredetector.polar.model.SeizureAlarmState
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Benchmark test validating Polar-Seizure's 3-8 Hz FFT engine against real-world seizure
 * telemetry data recorded by OpenSeizureDetector (OSD) repository (Benjamin_Fit_14nov2019/DataLog_2019-11-14.txt).
 *
 * OpenSeizureDetector algorithm parameters:
 * - 25 Hz sampling rate, 5-second analysis windows (125 samples).
 * - Region of interest: 3 - 8 Hz.
 * - Alarm Threshold: raw roiPower > alarmThresh (default 100), ratio (10 * roiPower / specPower) > 50-57%.
 * - Temporal progression: consecutive detections lead from OK -> WARNING (>=2 windows, 10s) -> ALARM (>=3 windows, 15s).
 *
 * Polar-Seizure algorithm parameters:
 * - 25 Hz sampling rate, 128 samples with 50% overlap (64 samples = 2.56s cadence).
 * - 3 - 8 Hz bandpass spectral energy ratio >= 50% (0.50).
 * - Temporal progression: consecutive detections lead from NORMAL -> WARNING (>=2 windows, ~5.1s) -> ALARM (>=4 windows, ~10.2s).
 */
class OpenSeizureDetectorBenchmarkTest {

    data class OsdBenchmarkRecord(
        val timestamp: String,
        val roiPower: Long,
        val specPower: Long,
        val sampleFreq: Int,
        val alarmState: String,
        val hr: Double,
        val rawCounts: List<Double>
    )

    private fun loadBenchmarkRecords(): List<OsdBenchmarkRecord> {
        val stream = javaClass.classLoader?.getResourceAsStream("openseizure/benjamin_seizure_20191114.csv")
            ?: throw IllegalStateException("Resource openseizure/benjamin_seizure_20191114.csv not found")
        val reader = BufferedReader(InputStreamReader(stream))
        val records = mutableListOf<OsdBenchmarkRecord>()

        reader.useLines { lines ->
            for (line in lines) {
                if (line.isBlank()) continue
                val parts = line.split(",")
                val timestamp = parts[0].trim()
                val roiPower = parts[1].trim().toLong()
                val specPower = parts[2].trim().toLong()
                val sampleFreq = parts[3].trim().toInt()
                val alarmState = parts[4].trim()
                val hr = parts[5].trim().toDouble()
                val rawCounts = parts.subList(6, parts.size).map { it.trim().toDouble() }

                records.add(
                    OsdBenchmarkRecord(
                        timestamp = timestamp,
                        roiPower = roiPower,
                        specPower = specPower,
                        sampleFreq = sampleFreq,
                        alarmState = alarmState,
                        hr = hr,
                        rawCounts = rawCounts
                    )
                )
            }
        }
        return records
    }

    @Test
    fun testOpenSeizureDetectorRealSeizureLogPlayback() {
        val records = loadBenchmarkRecords()
        assertTrue("Expected benchmark records to be loaded", records.isNotEmpty())

        val engine = SeizureFftEngine(
            windowSize = 128,
            sampleRateHz = 25.0,
            warningRatioThreshold = 0.50f,
            minMovementPowerThreshold = 0.05f
        )

        val processedResults = mutableListOf<Pair<String, SeizureAnalysisResult>>()
        var maxSeizureRatio = 0.0f
        var sawWarning = false
        var sawAlarm = false

        // In OpenSeizureDetector Pebble logs, stationary gravity baseline is ~1490 counts (~1.0g).
        // Standard scalar deviation in g is (counts - 1490.0) / 1490.0.
        // For SeizureFftEngine, addSample(x, y, z) computes sqrt(x^2 + y^2 + z^2) - 1.0g.
        // If we supply magnitude on Z axis as (1.0 + dev), sqrt(0^2 + 0^2 + (1.0 + dev)^2) - 1.0 = dev.
        val baselineCounts = 1490.0

        for (rec in records) {
            for (count in rec.rawCounts) {
                val devInG = (count - baselineCounts) / baselineCounts
                val res = engine.addSample(0.0, 0.0, 1.0 + devInG)
                if (res != null) {
                    processedResults.add(rec.timestamp to res)
                    if (res.fftRatio > maxSeizureRatio) {
                        maxSeizureRatio = res.fftRatio
                    }
                    if (res.state == SeizureAlarmState.WARNING) {
                        sawWarning = true
                    }
                    if (res.state == SeizureAlarmState.ALARM) {
                        sawAlarm = true
                    }
                }
            }
        }

        // 1. Verify that during pre-seizure baseline (first 2 records, 05:58:04 to 05:58:14), state remains NORMAL
        val earlyResults = processedResults.filter { it.first.contains("05:58:04") || it.first.contains("05:58:09") || it.first.contains("05:58:14") }
        assertTrue("Expected early results during pre-seizure stillness", earlyResults.isNotEmpty())
        for ((ts, res) in earlyResults) {
            assertEquals("Expected NORMAL state during pre-seizure stillness at $ts", SeizureAlarmState.NORMAL, res.state)
        }

        // 2. Verify that the 3-8 Hz power ratio peaks significantly (>= 70%) during clonic shaking
        assertTrue("Expected peak 3-8Hz FFT ratio > 0.70 during seizure, got $maxSeizureRatio", maxSeizureRatio >= 0.70f)

        // 3. Verify that the engine enters WARNING state as shaking persists
        assertTrue("Expected engine to transition to WARNING state during seizure", sawWarning)

        // 4. Verify that the engine enters ALARM state as shaking continues
        assertTrue("Expected engine to transition to ALARM state during seizure", sawAlarm)
    }

    @Test
    fun testOpenSeizureDetectorSyntheticComparison() {
        // Direct algorithmic comparison on pure frequency tones:
        // OSD ROI is 3.0 to 8.0 Hz.
        val engine = SeizureFftEngine(windowSize = 128, sampleRateHz = 25.0)

        // Test 1: 5.0 Hz pure vibration (in OSD ROI) -> must reach ALARM
        var lastResult: SeizureAnalysisResult? = null
        for (i in 0 until 400) {
            val t = i / 25.0
            val oscillation = 1.0 * kotlin.math.sin(2.0 * Math.PI * 5.0 * t)
            val res = engine.addSample(0.0, 0.0, 1.0 + oscillation)
            if (res != null) lastResult = res
        }
        assertTrue("5 Hz tone must yield ratio > 0.85", (lastResult?.fftRatio ?: 0f) > 0.85f)
        assertEquals("5 Hz tone must trigger ALARM", SeizureAlarmState.ALARM, lastResult?.state)

        // Test 2: 12.0 Hz tremor (outside OSD 3-8 Hz ROI) -> must NOT trigger seizure alarm
        val highFreqEngine = SeizureFftEngine(windowSize = 128, sampleRateHz = 25.0)
        var highFreqResult: SeizureAnalysisResult? = null
        for (i in 0 until 400) {
            val t = i / 25.0
            val oscillation = 1.0 * kotlin.math.sin(2.0 * Math.PI * 12.0 * t)
            val res = highFreqEngine.addSample(0.0, 0.0, 1.0 + oscillation)
            if (res != null) highFreqResult = res
        }
        assertTrue("12 Hz vibration outside ROI must have low 3-8Hz ratio", (highFreqResult?.fftRatio ?: 0f) < 0.20f)
        assertEquals("12 Hz vibration must remain NORMAL", SeizureAlarmState.NORMAL, highFreqResult?.state)
    }
}
