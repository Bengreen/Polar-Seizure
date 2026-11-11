package org.openseizuredetector.polar.alert

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel

/**
 * Siren & Haptic Alert Manager (PRD-004 §4).
 * Plays an audible alarm and haptic vibration pattern during pre-escalation countdowns
 * to allow wearers to abort false alarms before carer SMS transmission.
 */
class AlertAudibleManager(private val context: Context) {

    private var ringtone: Ringtone? = null
    private var isPlaying = false

    @Suppress("DEPRECATION")
    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator
        } else {
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    fun startSirenAndHaptics() {
        if (isPlaying) return
        isPlaying = true

        try {
            // 1. Play high-priority alarm ringtone
            var alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            }
            ringtone = RingtoneManager.getRingtone(context, alarmUri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                } else {
                    streamType = AudioManager.STREAM_ALARM
                }
                play()
            }

            // 2. Continuous emergency pulse vibration pattern: 500ms on, 250ms off
            val timings = longArrayOf(0, 500, 250, 500, 250, 500, 250)
            val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(timings, amplitudes, 0))
            } else {
                vibrator?.vibrate(timings, 0)
            }
            DiagnosticManager.log(LogLevel.WARN, "Emergency siren and haptic alert started.")
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to start alert siren: ${e.localizedMessage}")
        }
    }

    fun stopSirenAndHaptics() {
        if (!isPlaying) return
        isPlaying = false
        try {
            ringtone?.stop()
            ringtone = null
            vibrator?.cancel()
            DiagnosticManager.log(LogLevel.INFO, "Emergency siren and haptic alert stopped.")
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to stop alert siren: ${e.localizedMessage}")
        }
    }
}
