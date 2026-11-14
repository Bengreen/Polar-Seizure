package org.openseizuredetector.polar.alert

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.model.EmergencyAlertType

data class AlertHistoryRecord(
    val id: String,
    val alertType: EmergencyAlertType,
    val timestampMs: Long,
    val dateString: String,
    val smsSentCount: Int,
    val heartRateBpm: Int?,
    val energyRatioPercent: Double,
    val seizurePower3to8Hz: Double,
    val location: String?,
    val note: String? = null
)

/**
 * Manages persistent storage and retrieval of alert records (Panic, Test, Seizure, High-G)
 * with their vital metrics, GPS coordinates, and SMS dispatch status.
 */
class AlertHistoryManager(private val context: Context) {

    companion object {
        private val DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        private val FILE_DATE_FORMAT = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    }

    private val alertsDir: File by lazy {
        File(context.filesDir, "alerts").apply {
            if (!exists()) mkdirs()
        }
    }

    @Synchronized
    fun recordAlert(
        alertType: EmergencyAlertType,
        smsSentCount: Int,
        heartRateBpm: Int?,
        energyRatioPercent: Double,
        seizurePower3to8Hz: Double,
        location: String?,
        note: String? = null
    ): File? {
        val now = System.currentTimeMillis()
        val id = "alert_${alertType.name.lowercase()}_${FILE_DATE_FORMAT.format(Date(now))}"
        val file = File(alertsDir, "$id.json")
        return try {
            val dateStr = DATE_FORMAT.format(Date(now))
            val json = buildString {
                append("{\n")
                append("  \"id\": \"$id\",\n")
                append("  \"alertType\": \"${alertType.name}\",\n")
                append("  \"timestampMs\": $now,\n")
                append("  \"dateString\": \"$dateStr\",\n")
                append("  \"smsSentCount\": $smsSentCount,\n")
                append("  \"heartRateBpm\": ${heartRateBpm ?: "null"},\n")
                append("  \"energyRatioPercent\": ${"%.2f".format(Locale.US, energyRatioPercent)},\n")
                append("  \"seizurePower3to8Hz\": ${"%.4f".format(Locale.US, seizurePower3to8Hz)},\n")
                append("  \"location\": ${location?.let { "\"$it\"" } ?: "null"},\n")
                append("  \"note\": ${note?.let { "\"$it\"" } ?: "null"}\n")
                append("}\n")
            }
            file.writeText(json)
            DiagnosticManager.log(LogLevel.SUCCESS, "Alert recorded: ${alertType.displayName} ($id)")
            file
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to record alert: ${e.message}")
            null
        }
    }

    @Synchronized
    fun listAlertRecords(): List<AlertHistoryRecord> {
        if (!alertsDir.exists()) return emptyList()
        val files = alertsDir.listFiles { f -> f.extension == "json" } ?: return emptyList()
        return files.mapNotNull { f ->
            try {
                val text = f.readText()
                val id = "\"id\":\\s*\"([^\"]+)\"".toRegex().find(text)?.groupValues?.get(1) ?: f.nameWithoutExtension
                val typeStr = "\"alertType\":\\s*\"([^\"]+)\"".toRegex().find(text)?.groupValues?.get(1) ?: "PANIC"
                val type = runCatching { EmergencyAlertType.valueOf(typeStr) }.getOrDefault(EmergencyAlertType.PANIC)
                val timeMs = "\"timestampMs\":\\s*(\\d+)".toRegex().find(text)?.groupValues?.get(1)?.toLongOrNull() ?: f.lastModified()
                val dateStr = "\"dateString\":\\s*\"([^\"]+)\"".toRegex().find(text)?.groupValues?.get(1) ?: DATE_FORMAT.format(Date(timeMs))
                val smsCount = "\"smsSentCount\":\\s*(\\d+)".toRegex().find(text)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                val hr = "\"heartRateBpm\":\\s*(\\d+)".toRegex().find(text)?.groupValues?.get(1)?.toIntOrNull()
                val ratio = "\"energyRatioPercent\":\\s*([0-9.]+)".toRegex().find(text)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
                val power = "\"seizurePower3to8Hz\":\\s*([0-9.]+)".toRegex().find(text)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
                val loc = "\"location\":\\s*\"([^\"]+)\"".toRegex().find(text)?.groupValues?.get(1)
                val note = "\"note\":\\s*\"([^\"]+)\"".toRegex().find(text)?.groupValues?.get(1)
                AlertHistoryRecord(
                    id = id,
                    alertType = type,
                    timestampMs = timeMs,
                    dateString = dateStr,
                    smsSentCount = smsCount,
                    heartRateBpm = hr,
                    energyRatioPercent = ratio,
                    seizurePower3to8Hz = power,
                    location = loc,
                    note = note
                )
            } catch (e: Exception) {
                null
            }
        }.sortedByDescending { it.timestampMs }
    }

    @Synchronized
    fun deleteAlertRecord(id: String): Boolean {
        val file = File(alertsDir, "$id.json")
        return try {
            if (file.exists()) {
                val deleted = file.delete()
                if (deleted) {
                    DiagnosticManager.log(LogLevel.INFO, "Deleted alert record: $id")
                }
                deleted
            } else {
                false
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to delete alert record: ${e.message}")
            false
        }
    }

    @Synchronized
    fun getAlertFile(id: String): File? {
        val file = File(alertsDir, "$id.json")
        return if (file.exists()) file else null
    }
}
