package org.openseizuredetector.polar.alert

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
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

    private fun getPhoneBatteryLevel(): Int? {
        return try {
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val level = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (level != null && level in 0..100) {
                level
            } else {
                val batteryStatus = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                val rawLevel = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                if (rawLevel >= 0 && scale > 0) {
                    ((rawLevel / scale.toFloat()) * 100).toInt()
                } else null
            }
        } catch (e: Exception) {
            null
        }
    }

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

    fun dispatchSeizureAlert(
        contacts: List<CarerContact>,
        patientName: String,
        telemetry: LiveBleDiagnostics,
        position: GeoPosition?,
        isTest: Boolean = false,
        isPanic: Boolean = false
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

        val prefix = when {
            isPanic -> "🆘 PANIC ALERT: "
            isTest -> "[TEST ALERT] "
            else -> "🚨 EMERGENCY: "
        }
        val eventDesc = when {
            isPanic -> "Panic button pressed by $patientName"
            isTest -> "Polar-Seizure test report for $patientName"
            else -> "Polar-Seizure detected possible seizure for $patientName"
        }
        val hrInfo = telemetry.heartRateBpm?.let { " HR: ${it}bpm." } ?: ""
        val bandBatt = telemetry.batteryLevel?.let { " Band: ${it}%." } ?: ""
        val phoneBatt = getPhoneBatteryLevel()?.let { " Phone: ${it}%." } ?: ""
        val threshInfo = if (!isPanic) " Thresh: 3-8Hz (Ratio>=50%, Pwr>=0.05)." else ""

        val locationInfo = if (position != null) {
            "\nLocation: ${position.toMapsUrl()} (±${position.accuracyMeters.toInt()}m)"
        } else {
            "\nLocation: GPS acquiring / unavailable"
        }

        val messageText = "$prefix$eventDesc at $timestamp.$hrInfo$bandBatt$phoneBatt$threshInfo$locationInfo"

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
