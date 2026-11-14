package org.openseizuredetector.polar.incident

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel

data class AccelSampleRecord(
    val timestamp: Long,
    val x: Float,
    val y: Float,
    val z: Float,
    val magnitude: Float
)

data class PpgSampleRecord(
    val timestamp: Long,
    val channel0: Long,
    val channel1: Long,
    val derivedBpm: Int?
)

/**
 * IncidentDataRecorder maintains rolling circular ring buffers of raw ACC and PPG telemetry.
 * When a suspect movement event or seizure alarm occurs, it flushes pre-incident history
 * and continuous high-rate telemetry to disk.
 */
class IncidentDataRecorder(private val context: Context) {

    companion object {
        // 100 seconds at 25 Hz ACC = 2500 samples (guaranteeing >= 90s pre-alert window)
        private const val MAX_ACC_BUFFER_SIZE = 2500
        // 100 seconds at 22 Hz PPG = 2200 samples (guaranteeing >= 90s pre-alert window)
        private const val MAX_PPG_BUFFER_SIZE = 2200
        private val DATE_FORMAT = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    }

    private val accRingBuffer = ArrayDeque<AccelSampleRecord>(MAX_ACC_BUFFER_SIZE)
    private val ppgRingBuffer = ArrayDeque<PpgSampleRecord>(MAX_PPG_BUFFER_SIZE)

    private var isRecordingActiveIncident = false
    private var currentIncidentId: String? = null
    private var activeIncidentAccSamples = mutableListOf<AccelSampleRecord>()
    private var activeIncidentPpgSamples = mutableListOf<PpgSampleRecord>()

    @Synchronized
    fun recordAccel(timestamp: Long, x: Float, y: Float, z: Float, magnitude: Float) {
        val sample = AccelSampleRecord(timestamp, x, y, z, magnitude)
        if (accRingBuffer.size >= MAX_ACC_BUFFER_SIZE) {
            accRingBuffer.removeFirst()
        }
        accRingBuffer.addLast(sample)

        if (isRecordingActiveIncident) {
            activeIncidentAccSamples.add(sample)
        }
    }

    @Synchronized
    fun recordPpg(timestamp: Long, channel0: Long, channel1: Long, bpm: Int?) {
        val sample = PpgSampleRecord(timestamp, channel0, channel1, bpm)
        if (ppgRingBuffer.size >= MAX_PPG_BUFFER_SIZE) {
            ppgRingBuffer.removeFirst()
        }
        ppgRingBuffer.addLast(sample)

        if (isRecordingActiveIncident) {
            activeIncidentPpgSamples.add(sample)
        }
    }

    @Synchronized
    fun onIncidentEscalationTriggered(reason: String) {
        if (!isRecordingActiveIncident) {
            isRecordingActiveIncident = true
            currentIncidentId = "incident_${DATE_FORMAT.format(Date())}"
            DiagnosticManager.log(
                LogLevel.INFO,
                "Incident recorder activated [$reason]. Retaining pre-incident buffers (${accRingBuffer.size} ACC, ${ppgRingBuffer.size} PPG)."
            )
            // Pre-seed active incident buffers with pre-incident rolling history
            activeIncidentAccSamples = accRingBuffer.toMutableList()
            activeIncidentPpgSamples = ppgRingBuffer.toMutableList()
        }
    }

    @Synchronized
    fun onIncidentDeescalated(): File? {
        if (!isRecordingActiveIncident) return null
        val incidentId = currentIncidentId ?: "incident_${System.currentTimeMillis()}"
        isRecordingActiveIncident = false
        currentIncidentId = null

        val dir = File(context.filesDir, "incidents")
        if (!dir.exists()) {
            dir.mkdirs()
        }

        val file = File(dir, "${incidentId}.json")
        try {
            val json = buildString {
                append("{\n")
                append("  \"incidentId\": \"$incidentId\",\n")
                append("  \"savedAt\": ${System.currentTimeMillis()},\n")
                append("  \"accSampleCount\": ${activeIncidentAccSamples.size},\n")
                append("  \"ppgSampleCount\": ${activeIncidentPpgSamples.size},\n")
                append("  \"accSamples\": [\n")
                activeIncidentAccSamples.forEachIndexed { i, s ->
                    append("    {\"t\":${s.timestamp},\"x\":${s.x},\"y\":${s.y},\"z\":${s.z},\"m\":${s.magnitude}}")
                    if (i < activeIncidentAccSamples.size - 1) append(",")
                    append("\n")
                }
                append("  ],\n")
                append("  \"ppgSamples\": [\n")
                activeIncidentPpgSamples.forEachIndexed { i, s ->
                    append("    {\"t\":${s.timestamp},\"c0\":${s.channel0},\"c1\":${s.channel1},\"bpm\":${s.derivedBpm ?: "null"}}")
                    if (i < activeIncidentPpgSamples.size - 1) append(",")
                    append("\n")
                }
                append("  ]\n")
                append("}\n")
            }
            file.writeText(json)
            DiagnosticManager.log(
                LogLevel.SUCCESS,
                "Incident saved to ${file.name} (${activeIncidentAccSamples.size} ACC, ${activeIncidentPpgSamples.size} PPG samples)."
            )
            return file
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to save incident data: ${e.message}")
            return null
        } finally {
            activeIncidentAccSamples.clear()
            activeIncidentPpgSamples.clear()
        }
    }

    fun isRecording(): Boolean = isRecordingActiveIncident
}
