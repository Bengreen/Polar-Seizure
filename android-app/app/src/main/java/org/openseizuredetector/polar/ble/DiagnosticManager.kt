package org.openseizuredetector.polar.ble

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class LogLevel {
    INFO,
    SUCCESS,
    WARN,
    ERROR
}

data class DiagnosticLogEntry(
    val id: String = java.util.UUID.randomUUID().toString(),
    val timestamp: String,
    val level: LogLevel,
    val message: String
)

data class DiscoveredDevice(
    val deviceId: String,
    val name: String,
    val rssi: Int,
    val isConnectable: Boolean
)

data class AccelHistoryPoint(
    val timestamp: Long,
    val x: Float,
    val y: Float,
    val z: Float,
    val magnitude: Float,
    val energyRatio: Float
)

data class HrHistoryPoint(
    val timestamp: Long,
    val bpm: Int
)

data class LiveBleDiagnostics(
    val isServiceRunning: Boolean = false,
    val connectionState: String = "DISCONNECTED",
    val connectedDeviceId: String? = null,
    val connectedDeviceName: String? = null,
    val batteryLevel: Int? = null,
    val batteryRemainingHoursEstimate: Double? = null,
    val heartRateBpm: Int? = null,
    val isStreamingAcc: Boolean = false,
    val isStreamingHr: Boolean = false,
    val isPpgDutyCycleActive: Boolean = false,
    val isIncidentRecording: Boolean = false,
    val sampleRateHz: Double = 0.0,
    val lastPacketLatencyMs: Long = 0,
    val lastAccX: Double = 0.0,
    val lastAccY: Double = 0.0,
    val lastAccZ: Double = 0.0,
    val lastMagnitude: Double = 0.0,
    val seizurePower3to8Hz: Double = 0.0,
    val totalPower: Double = 0.0,
    val energyRatioPercent: Double = 0.0,
    val isStillnessGated: Boolean = true,
    val pendingEmergencyCountdownSeconds: Int? = null,
    val pendingEmergencyType: String? = null,
    val accelHistory: List<AccelHistoryPoint> = emptyList(),
    val hrHistory: List<HrHistoryPoint> = emptyList()
)

object DiagnosticManager {
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())

    private val _logs = MutableStateFlow<List<DiagnosticLogEntry>>(emptyList())
    val logs: StateFlow<List<DiagnosticLogEntry>> = _logs.asStateFlow()

    private val _discoveredDevices = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val discoveredDevices: StateFlow<List<DiscoveredDevice>> = _discoveredDevices.asStateFlow()

    private val _telemetry = MutableStateFlow(LiveBleDiagnostics())
    val telemetry: StateFlow<LiveBleDiagnostics> = _telemetry.asStateFlow()

    fun log(level: LogLevel, message: String) {
        val entry = DiagnosticLogEntry(
            timestamp = timeFormat.format(Date()),
            level = level,
            message = message
        )
        when (level) {
            LogLevel.INFO -> android.util.Log.i("PolarSeizure", message)
            LogLevel.SUCCESS -> android.util.Log.i("PolarSeizure", "SUCCESS: $message")
            LogLevel.WARN -> android.util.Log.w("PolarSeizure", message)
            LogLevel.ERROR -> android.util.Log.e("PolarSeizure", message)
        }
        // Keep up to 200 recent log messages
        val current = _logs.value.toMutableList()
        current.add(0, entry)
        if (current.size > 200) {
            current.removeAt(current.size - 1)
        }
        _logs.value = current
    }

    fun addOrUpdateDevice(device: DiscoveredDevice) {
        val current = _discoveredDevices.value.toMutableList()
        val index = current.indexOfFirst { it.deviceId == device.deviceId }
        if (index >= 0) {
            current[index] = device
        } else {
            current.add(device)
        }
        _discoveredDevices.value = current
    }

    fun clearDevices() {
        _discoveredDevices.value = emptyList()
    }

    fun updateTelemetry(update: (LiveBleDiagnostics) -> LiveBleDiagnostics) {
        _telemetry.value = update(_telemetry.value)
    }

    fun clearLogs() {
        _logs.value = emptyList()
    }
}
