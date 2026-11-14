package org.openseizuredetector.polar.incident

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.GZIPOutputStream
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel

data class DailyArchiveFileInfo(
    val fileName: String,
    val sizeBytes: Long,
    val file: File,
    val dateString: String
)

/**
 * DailyTelemetryLogger streams continuous 25 Hz ACC, optical PPG, and 1 Hz DSP telemetry
 * into compressed Newline-Delimited JSON (.json.gz) archives, segmented by day (e.g. ps_telemetry_2026-11-11.json.gz).
 * Compression reduces 24-hour raw data from ~120-150 MB down to ~12-18 MB.
 */
class DailyTelemetryLogger(private val context: Context) {

    companion object {
        private val DAY_FORMAT = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        private const val FLUSH_INTERVAL_MS = 10_000L // Flush compressed chunks every 10s
    }

    private val archiveDir = File(context.filesDir, "daily_telemetry").apply {
        if (!exists()) mkdirs()
    }

    private var currentDay: String? = null
    private var currentFile: File? = null
    private var gzipStream: GZIPOutputStream? = null
    private var writer: OutputStreamWriter? = null
    private var lastFlushTime: Long = 0

    @Synchronized
    private fun ensureWriter(): OutputStreamWriter? {
        val today = DAY_FORMAT.format(Date())
        if (writer == null || currentDay != today) {
            closeCurrentWriter()
            currentDay = today
            val file = File(archiveDir, "ps_telemetry_${today}.json.gz")
            currentFile = file
            try {
                // If appending to existing gzip, standard practice is opening a fresh gzip stream chunk
                // GZIP format naturally concatenates multiple gzip members
                val fos = FileOutputStream(file, true)
                val gzos = GZIPOutputStream(fos, 8192)
                gzipStream = gzos
                writer = OutputStreamWriter(gzos, Charsets.UTF_8)
                DiagnosticManager.log(LogLevel.INFO, "Opened daily telemetry archive: ${file.name}")
            } catch (e: Exception) {
                DiagnosticManager.log(LogLevel.ERROR, "Failed to open daily archive: ${e.message}")
                return null
            }
        }
        return writer
    }

    @Synchronized
    fun logAccel(timestamp: Long, x: Float, y: Float, z: Float, magnitude: Float) {
        val w = ensureWriter() ?: return
        try {
            w.write("{\"type\":\"acc\",\"t\":$timestamp,\"x\":$x,\"y\":$y,\"z\":$z,\"m\":$magnitude}\n")
            maybeFlush()
        } catch (e: Exception) {
            // Ignore write errors to prevent blocking BLE callbacks
        }
    }

    @Synchronized
    fun logPpg(timestamp: Long, channel0: Long, channel1: Long, bpm: Int?) {
        val w = ensureWriter() ?: return
        try {
            w.write("{\"type\":\"ppg\",\"t\":$timestamp,\"c0\":$channel0,\"c1\":$channel1,\"bpm\":${bpm ?: "null"}}\n")
            maybeFlush()
        } catch (e: Exception) {
            // Ignore
        }
    }

    @Synchronized
    fun logDsp(timestamp: Long, bpm: Int?, ratioPct: Float, bandPower: Double, totalPower: Double, state: String) {
        val w = ensureWriter() ?: return
        try {
            w.write("{\"type\":\"dsp\",\"t\":$timestamp,\"bpm\":${bpm ?: "null"},\"ratio\":$ratioPct,\"band\":$bandPower,\"total\":$totalPower,\"state\":\"$state\"}\n")
            maybeFlush()
        } catch (e: Exception) {
            // Ignore
        }
    }

    private fun maybeFlush() {
        val now = System.currentTimeMillis()
        if (now - lastFlushTime >= FLUSH_INTERVAL_MS) {
            lastFlushTime = now
            try {
                writer?.flush()
                gzipStream?.flush()
            } catch (e: Exception) {
                // Ignore flush errors
            }
        }
    }

    @Synchronized
    fun closeCurrentWriter() {
        try {
            writer?.flush()
            writer?.close()
        } catch (e: Exception) {
            // Ignore
        } finally {
            writer = null
            gzipStream = null
        }
    }

    fun listAvailableArchives(): List<DailyArchiveFileInfo> {
        val files = archiveDir.listFiles { f -> f.name.startsWith("ps_telemetry_") && f.name.endsWith(".json.gz") }
            ?: return emptyList()

        return files.sortedByDescending { it.lastModified() }.map { f ->
            val datePart = f.name.removePrefix("ps_telemetry_").removeSuffix(".json.gz")
            DailyArchiveFileInfo(
                fileName = f.name,
                sizeBytes = f.length(),
                file = f,
                dateString = datePart
            )
        }
    }

    fun deleteArchive(file: File): Boolean {
        return try {
            if (currentFile?.absolutePath == file.absolutePath) {
                closeCurrentWriter()
                currentFile = null
                currentDay = null
            }
            val deleted = file.delete()
            if (deleted) {
                DiagnosticManager.log(LogLevel.INFO, "Deleted archive: ${file.name}")
            }
            deleted
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to delete archive ${file.name}: ${e.message}")
            false
        }
    }
}
