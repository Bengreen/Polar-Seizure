package org.openseizuredetector.polar.watchdog

import org.openseizuredetector.polar.model.SeizureAlarmState
import java.util.concurrent.atomic.AtomicLong

/**
 * Fail-Safe Dead Man's Watchdog Timer.
 * Tracks elapsed time since the last valid BLE telemetry packet arrived.
 */
class DeadmanWatchdog(
    private val warningThresholdMs: Long = 15_000L,
    private val criticalThresholdMs: Long = 30_000L,
    private val onStateChange: (SeizureAlarmState) -> Unit
) {
    private val lastHeartbeat = AtomicLong(System.currentTimeMillis())
    private var currentState = SeizureAlarmState.NORMAL

    fun feed() {
        lastHeartbeat.set(System.currentTimeMillis())
        if (currentState != SeizureAlarmState.NORMAL) {
            currentState = SeizureAlarmState.NORMAL
            onStateChange(SeizureAlarmState.NORMAL)
        }
    }

    fun checkStatus(): SeizureAlarmState {
        val elapsed = System.currentTimeMillis() - lastHeartbeat.get()
        val newState = when {
            elapsed >= criticalThresholdMs -> SeizureAlarmState.DISCONNECTED
            elapsed >= warningThresholdMs -> SeizureAlarmState.WARNING
            else -> SeizureAlarmState.NORMAL
        }

        if (newState != currentState) {
            currentState = newState
            onStateChange(newState)
        }
        return newState
    }
}
