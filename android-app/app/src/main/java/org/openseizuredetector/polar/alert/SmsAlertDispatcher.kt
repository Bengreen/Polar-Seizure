package org.openseizuredetector.polar.alert

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.ble.LiveBleDiagnostics
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to obtain SmsManager: ${e.localizedMessage}")
            null
        }
    }

    fun dispatchSeizureAlert(
        contacts: List<CarerContact>,
        patientName: String,
        telemetry: LiveBleDiagnostics,
        position: GeoPosition?,
        isTest: Boolean = false
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

        val prefix = if (isTest) "[TEST ALERT] " else "🚨 EMERGENCY: "
        val hrInfo = telemetry.heartRateBpm?.let { " HR: ${it}bpm." } ?: ""
        val battInfo = telemetry.batteryLevel?.let { " Band Batt: ${it}%." } ?: ""

        val locationInfo = if (position != null) {
            "\nLocation: ${position.toMapsUrl()} (±${position.accuracyMeters.toInt()}m)"
        } else {
            "\nLocation: GPS acquiring / unavailable"
        }

        val messageText = "${prefix}Polar-Seizure detected possible seizure for $patientName at $timestamp.$hrInfo$battInfo$locationInfo"

        var sentCount = 0
        for (carer in enabledContacts) {
            try {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Sending alert SMS to ${carer.name} (${carer.phoneNumber})..."
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
