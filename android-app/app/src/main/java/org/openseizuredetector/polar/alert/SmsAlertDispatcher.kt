package org.openseizuredetector.polar.alert

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LiveBleDiagnostics
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.model.EmergencyAlertType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SmsAlertDispatcher(private val context: Context) {

    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun getSmsManager(): SmsManager? {
        return try {
            val sm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            sm ?: run {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to obtain SmsManager: ${e.localizedMessage}")
            try {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            } catch (fallbackError: Exception) {
                null
            }
        }
    }

    /**
     * Dispatch emergency alert SMS according to the required template:
     * For panic, seizure, and high-g: includes HR, Seizure Threshold/Ratio, and Position (Google Maps link).
     * Excludes battery levels per clinical safety guidelines.
     */
    fun dispatchEmergencyAlert(
        alertType: EmergencyAlertType,
        contacts: List<CarerContact>,
        patientName: String,
        telemetry: LiveBleDiagnostics,
        position: GeoPosition?
    ): Int {
        if (!hasSmsPermission()) {
            DiagnosticManager.log(
                LogLevel.ERROR,
                "Cannot dispatch SMS alerts: SEND_SMS permission is not granted."
            )
            return 0
        }

        val enabledContacts = contacts.filter { it.isEnabled && it.phoneNumber.isNotBlank() }
        if (enabledContacts.isEmpty()) {
            DiagnosticManager.log(
                LogLevel.WARN,
                "No active carer phone numbers configured. Skipping SMS alert dispatch."
            )
            return 0
        }

        val smsManager = getSmsManager() ?: return 0
        val timestamp = timeFormat.format(Date())

        val hrString = telemetry.heartRateBpm?.let { "${it} bpm" } ?: "N/A"
        val ratioFormatted = "%.1f%%".format(telemetry.energyRatioPercent)
        val powerFormatted = "%.3f".format(telemetry.seizurePower3to8Hz)
        val seizureMetrics = "$ratioFormatted (Pwr: $powerFormatted)"

        val locationString = if (position != null) {
            "${position.toMapsUrl()} (±${position.accuracyMeters.toInt()}m)"
        } else {
            "GPS acquiring / unavailable"
        }

        // Standardized alert template:
        // [POLAR-SEIZURE ALERT: <TYPE>] Patient: <Name> | Time: <Time> | HR: <HR> | Seizure Threshold: <Ratio> | Location: <URL>
        val messageText = "[${alertType.smsPrefix}] Patient: $patientName | Time: $timestamp | HR: $hrString | Seizure Threshold: $seizureMetrics | Location: $locationString"

        var sentCount = 0
        for (carer in enabledContacts) {
            try {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Sending ${alertType.displayName} SMS to ${carer.name} (${carer.phoneNumber})..."
                )
                val parts = smsManager.divideMessage(messageText)
                if (parts.size > 1) {
                    smsManager.sendMultipartTextMessage(carer.phoneNumber, null, parts, null, null)
                } else {
                    smsManager.sendTextMessage(carer.phoneNumber, null, messageText, null, null)
                }
                sentCount++
                DiagnosticManager.log(
                    LogLevel.SUCCESS,
                    "Alert SMS queued for carrier transmission to ${carer.phoneNumber}."
                )
            } catch (e: Exception) {
                DiagnosticManager.log(
                    LogLevel.ERROR,
                    "Failed to send SMS to ${carer.phoneNumber}: ${e.localizedMessage}"
                )
            }
        }
        return sentCount
    }
}
