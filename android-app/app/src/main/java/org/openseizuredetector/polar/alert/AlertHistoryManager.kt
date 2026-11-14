package org.openseizuredetector.polar.alert

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
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
    val note: String? = null,
    val incidentFileName: String? = null
)

/**
 * SQLite helper managing the lightweight dedicated alerts table.
 * Guaranteed sub-millisecond query time without touching heavy raw telemetry files.
 */
class AlertDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "polar_alerts.db"
        const val DATABASE_VERSION = 1

        const val TABLE_ALERTS = "alerts"
        const val COL_ID = "id"
        const val COL_ALERT_TYPE = "alert_type"
        const val COL_TIMESTAMP_MS = "timestamp_ms"
        const val COL_DATE_STRING = "date_string"
        const val COL_SMS_SENT_COUNT = "sms_sent_count"
        const val COL_HEART_RATE_BPM = "heart_rate_bpm"
        const val COL_ENERGY_RATIO_PCT = "energy_ratio_pct"
        const val COL_SEIZURE_POWER_3_TO_8_HZ = "seizure_power_3_to_8_hz"
        const val COL_LOCATION = "location"
        const val COL_NOTE = "note"
        const val COL_INCIDENT_FILE_NAME = "incident_file_name"
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createTableSql = """
            CREATE TABLE $TABLE_ALERTS (
                $COL_ID TEXT PRIMARY KEY,
                $COL_ALERT_TYPE TEXT NOT NULL,
                $COL_TIMESTAMP_MS INTEGER NOT NULL,
                $COL_DATE_STRING TEXT NOT NULL,
                $COL_SMS_SENT_COUNT INTEGER NOT NULL DEFAULT 0,
                $COL_HEART_RATE_BPM INTEGER,
                $COL_ENERGY_RATIO_PCT REAL NOT NULL DEFAULT 0.0,
                $COL_SEIZURE_POWER_3_TO_8_HZ REAL NOT NULL DEFAULT 0.0,
                $COL_LOCATION TEXT,
                $COL_NOTE TEXT,
                $COL_INCIDENT_FILE_NAME TEXT
            )
        """.trimIndent()
        db.execSQL(createTableSql)
        db.execSQL("CREATE INDEX idx_alerts_timestamp ON $TABLE_ALERTS ($COL_TIMESTAMP_MS DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Simple schema migration strategy: recreate table if upgraded
        db.execSQL("DROP TABLE IF EXISTS $TABLE_ALERTS")
        onCreate(db)
    }
}

/**
 * Manages persistent storage and retrieval of alert records (Panic, Test, Seizure, High-G)
 * using a dedicated, high-performance SQLite table.
 */
class AlertHistoryManager(private val context: Context) {

    companion object {
        private val DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        private val FILE_DATE_FORMAT = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    }

    private val dbHelper = AlertDatabaseHelper(context)

    @Synchronized
    fun recordAlert(
        alertType: EmergencyAlertType,
        smsSentCount: Int,
        heartRateBpm: Int?,
        energyRatioPercent: Double,
        seizurePower3to8Hz: Double,
        location: String?,
        note: String? = null,
        incidentFileName: String? = null
    ): AlertHistoryRecord? {
        val now = System.currentTimeMillis()
        val id = "alert_${alertType.name.lowercase()}_${FILE_DATE_FORMAT.format(Date(now))}"
        val dateStr = DATE_FORMAT.format(Date(now))

        return try {
            val db = dbHelper.writableDatabase
            val values = ContentValues().apply {
                put(AlertDatabaseHelper.COL_ID, id)
                put(AlertDatabaseHelper.COL_ALERT_TYPE, alertType.name)
                put(AlertDatabaseHelper.COL_TIMESTAMP_MS, now)
                put(AlertDatabaseHelper.COL_DATE_STRING, dateStr)
                put(AlertDatabaseHelper.COL_SMS_SENT_COUNT, smsSentCount)
                if (heartRateBpm != null) {
                    put(AlertDatabaseHelper.COL_HEART_RATE_BPM, heartRateBpm)
                } else {
                    putNull(AlertDatabaseHelper.COL_HEART_RATE_BPM)
                }
                put(AlertDatabaseHelper.COL_ENERGY_RATIO_PCT, energyRatioPercent)
                put(AlertDatabaseHelper.COL_SEIZURE_POWER_3_TO_8_HZ, seizurePower3to8Hz)
                if (location != null) {
                    put(AlertDatabaseHelper.COL_LOCATION, location)
                } else {
                    putNull(AlertDatabaseHelper.COL_LOCATION)
                }
                if (note != null) {
                    put(AlertDatabaseHelper.COL_NOTE, note)
                } else {
                    putNull(AlertDatabaseHelper.COL_NOTE)
                }
                if (incidentFileName != null) {
                    put(AlertDatabaseHelper.COL_INCIDENT_FILE_NAME, incidentFileName)
                } else {
                    putNull(AlertDatabaseHelper.COL_INCIDENT_FILE_NAME)
                }
            }
            db.insertWithOnConflict(
                AlertDatabaseHelper.TABLE_ALERTS,
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            )
            DiagnosticManager.log(LogLevel.SUCCESS, "Alert recorded in SQLite: ${alertType.displayName} ($id)")

            AlertHistoryRecord(
                id = id,
                alertType = alertType,
                timestampMs = now,
                dateString = dateStr,
                smsSentCount = smsSentCount,
                heartRateBpm = heartRateBpm,
                energyRatioPercent = energyRatioPercent,
                seizurePower3to8Hz = seizurePower3to8Hz,
                location = location,
                note = note,
                incidentFileName = incidentFileName
            )
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to record alert in SQLite: ${e.message}")
            null
        }
    }

    @Synchronized
    fun listAlertRecords(limit: Int = 100): List<AlertHistoryRecord> {
        val list = mutableListOf<AlertHistoryRecord>()
        try {
            val db = dbHelper.readableDatabase
            val cursor = db.query(
                AlertDatabaseHelper.TABLE_ALERTS,
                null,
                null,
                null,
                null,
                null,
                "${AlertDatabaseHelper.COL_TIMESTAMP_MS} DESC",
                limit.toString()
            )

            cursor.use { c ->
                val idIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_ID)
                val typeIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_ALERT_TYPE)
                val timeIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_TIMESTAMP_MS)
                val dateIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_DATE_STRING)
                val smsIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_SMS_SENT_COUNT)
                val hrIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_HEART_RATE_BPM)
                val ratioIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_ENERGY_RATIO_PCT)
                val powerIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_SEIZURE_POWER_3_TO_8_HZ)
                val locIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_LOCATION)
                val noteIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_NOTE)
                val incIdx = c.getColumnIndexOrThrow(AlertDatabaseHelper.COL_INCIDENT_FILE_NAME)

                while (c.moveToNext()) {
                    val id = c.getString(idIdx)
                    val typeStr = c.getString(typeIdx)
                    val alertType = runCatching { EmergencyAlertType.valueOf(typeStr) }
                        .getOrDefault(EmergencyAlertType.PANIC)
                    val timestampMs = c.getLong(timeIdx)
                    val dateStr = c.getString(dateIdx)
                    val smsCount = c.getInt(smsIdx)
                    val hr = if (c.isNull(hrIdx)) null else c.getInt(hrIdx)
                    val ratio = c.getDouble(ratioIdx)
                    val power = c.getDouble(powerIdx)
                    val loc = if (c.isNull(locIdx)) null else c.getString(locIdx)
                    val note = if (c.isNull(noteIdx)) null else c.getString(noteIdx)
                    val incidentFile = if (c.isNull(incIdx)) null else c.getString(incIdx)

                    list.add(
                        AlertHistoryRecord(
                            id = id,
                            alertType = alertType,
                            timestampMs = timestampMs,
                            dateString = dateStr,
                            smsSentCount = smsCount,
                            heartRateBpm = hr,
                            energyRatioPercent = ratio,
                            seizurePower3to8Hz = power,
                            location = loc,
                            note = note,
                            incidentFileName = incidentFile
                        )
                    )
                }
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to query alerts SQLite: ${e.message}")
        }
        return list
    }

    @Synchronized
    fun deleteAlertRecord(id: String): Boolean {
        return try {
            val db = dbHelper.writableDatabase
            val rows = db.delete(
                AlertDatabaseHelper.TABLE_ALERTS,
                "${AlertDatabaseHelper.COL_ID} = ?",
                arrayOf(id)
            )
            val deleted = rows > 0
            if (deleted) {
                DiagnosticManager.log(LogLevel.INFO, "Deleted alert record from SQLite: $id")
            }
            deleted
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to delete alert record: ${e.message}")
            false
        }
    }

    /**
     * Generates a shareable summary JSON file on demand for an alert record.
     */
    fun exportAlertAsFile(alert: AlertHistoryRecord): File? {
        val exportDir = File(context.cacheDir, "alert_exports").apply {
            if (!exists()) mkdirs()
        }
        val file = File(exportDir, "${alert.id}.json")
        return try {
            val json = buildString {
                append("{\n")
                append("  \"id\": \"${alert.id}\",\n")
                append("  \"alertType\": \"${alert.alertType.name}\",\n")
                append("  \"timestampMs\": ${alert.timestampMs},\n")
                append("  \"dateString\": \"${alert.dateString}\",\n")
                append("  \"smsSentCount\": ${alert.smsSentCount},\n")
                append("  \"heartRateBpm\": ${alert.heartRateBpm ?: "null"},\n")
                append("  \"energyRatioPercent\": ${"%.2f".format(Locale.US, alert.energyRatioPercent)},\n")
                append("  \"seizurePower3to8Hz\": ${"%.4f".format(Locale.US, alert.seizurePower3to8Hz)},\n")
                append("  \"location\": ${alert.location?.let { "\"$it\"" } ?: "null"},\n")
                append("  \"note\": ${alert.note?.let { "\"$it\"" } ?: "null"},\n")
                append("  \"incidentFileName\": ${alert.incidentFileName?.let { "\"$it\"" } ?: "null"}\n")
                append("}\n")
            }
            file.writeText(json)
            file
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to export alert file: ${e.message}")
            null
        }
    }
}
