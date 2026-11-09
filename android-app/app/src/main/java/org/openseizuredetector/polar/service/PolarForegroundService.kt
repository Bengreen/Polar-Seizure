package org.openseizuredetector.polar.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.openseizuredetector.polar.MainActivity
import org.openseizuredetector.polar.R
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.ble.PolarBleClient
import org.openseizuredetector.polar.model.SeizureAlarmState
import org.openseizuredetector.polar.watchdog.DeadmanWatchdog

class PolarForegroundService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var wakeLock: PowerManager.WakeLock? = null

    private var polarBleClient: PolarBleClient? = null
    private lateinit var watchdog: DeadmanWatchdog

    companion object {
        const val CHANNEL_ID = "polar_monitoring_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START_MONITORING"
        const val ACTION_STOP = "ACTION_STOP_MONITORING"
        const val ACTION_CANCEL_ALARM = "ACTION_CANCEL_ALARM"
        const val ACTION_CONNECT_DEVICE = "ACTION_CONNECT_DEVICE"
        const val ACTION_DISCONNECT_DEVICE = "ACTION_DISCONNECT_DEVICE"
        const val EXTRA_DEVICE_ID = "EXTRA_DEVICE_ID"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "PolarSeizure:ContinuousMonitoringWakeLock"
        ).apply {
            setReferenceCounted(false)
        }

        watchdog = DeadmanWatchdog { state ->
            updateNotification("Status: $state")
        }

        polarBleClient = PolarBleClient(this) { alarmState ->
            watchdog.feed()
            when (alarmState) {
                SeizureAlarmState.WARNING -> updateNotification("⚠️ WARNING: Rhythmic seizure motion detected")
                SeizureAlarmState.ALARM -> updateNotification("🚨 ALARM: Prolonged seizure activity confirmed!")
                SeizureAlarmState.DISCONNECTED -> updateNotification("Sensor disconnected")
                SeizureAlarmState.NORMAL -> updateNotification("Monitoring active — Normal")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                DiagnosticManager.log(LogLevel.INFO, "Foreground service received STOP action.")
                stopMonitoring()
                stopSelf()
            }
            ACTION_CANCEL_ALARM -> {
                DiagnosticManager.log(LogLevel.INFO, "Alarm cancelled by user from notification.")
                updateNotification("Alarm cancelled by wearer")
            }
            ACTION_CONNECT_DEVICE -> {
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID)
                if (deviceId != null) {
                    DiagnosticManager.log(LogLevel.INFO, "Service connecting to specified device: $deviceId")
                    polarBleClient?.connect(deviceId)
                }
            }
            ACTION_DISCONNECT_DEVICE -> {
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID)
                if (deviceId != null) {
                    DiagnosticManager.log(LogLevel.INFO, "Service disconnecting device: $deviceId")
                    polarBleClient?.disconnect(deviceId)
                }
            }
            else -> {
                startMonitoring()
            }
        }
        return START_STICKY
    }

    private fun startMonitoring() {
        try {
            wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hours max
            DiagnosticManager.log(LogLevel.INFO, "Partial WakeLock acquired.")
            val notification = buildNotification("Monitoring active — Scanning for Polar devices")

            val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            } else {
                0
            }

            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                fgsType
            )

            // Start scanning for nearby Polar wearables automatically on service startup
            polarBleClient?.startScan()
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Error starting foreground service: ${e.localizedMessage}")
        }
    }

    private fun stopMonitoring() {
        polarBleClient?.shutDown()
        polarBleClient = null

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
            DiagnosticManager.log(LogLevel.INFO, "Partial WakeLock released.")
        }
        serviceScope.cancel()
    }

    private fun buildNotification(statusText: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val cancelAlarmIntent = Intent(this, PolarForegroundService::class.java).apply {
            action = ACTION_CANCEL_ALARM
        }
        val cancelPendingIntent = PendingIntent.getService(
            this,
            1,
            cancelAlarmIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.service_notification_title))
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel Alarm", cancelPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
    }

    private fun updateNotification(statusText: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(statusText))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_monitoring_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.service_notification_desc)
                enableVibration(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMonitoring()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
