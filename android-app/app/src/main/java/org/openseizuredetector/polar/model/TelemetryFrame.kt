package org.openseizuredetector.polar.model

data class TelemetryFrame(
    val deviceId: String,
    val timestamp: Long = System.currentTimeMillis(),
    val heartRate: Int? = null,
    val batteryPercent: Int = 100,
    val fftRatio: Float = 0.0f,
    val peakFrequencyHz: Float = 0.0f,
    val totalPower: Float = 0.0f,
    val state: SeizureAlarmState = SeizureAlarmState.NORMAL
)
