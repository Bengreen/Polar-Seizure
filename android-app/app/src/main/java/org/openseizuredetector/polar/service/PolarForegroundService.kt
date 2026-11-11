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
import org.openseizuredetector.polar.alert.CarerContactManager
import org.openseizuredetector.polar.alert.LocationProvider
import org.openseizuredetector.polar.alert.SmsAlertDispatcher
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
    private var lastReportedState: SeizureAlarmState? = null

    private val carerManager by lazy { CarerContactManager(this) }
    private val locationProvider by lazy { LocationProvider(this) }
    private val smsDispatcher by lazy { SmsAlertDispatcher(this) }
    private var lastSmsDispatchTimeMs: Long = 0

    companion object {
        const val CHANNEL_ID = "polar_monitoring_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START_MONITORING"
        const val ACTION_STOP = "ACTION_STOP_MONITORING"
        const val ACTION_CANCEL_ALARM = "ACTION_CANCEL_ALARM"
        const val ACTION_CONNECT_DEVICE = "ACTION_CONNECT_DEVICE"
        const val ACTION_DISCONNECT_DEVICE = "ACTION_DISCONNECT_DEVICE"
        const val ACTION_START_SCAN = "ACTION_START_SCAN"
        const val ACTION_STOP_SCAN = "ACTION_STOP_SCAN"
        const val ACTION_TEST_SMS_ALERT = "ACTION_TEST_SMS_ALERT"
        const val EXTRA_DEVICE_ID = "EXTRA_DEVICE_ID"
        private const val SMS_COOLDOWN_MS = 60_000L // Prevent SMS storming (1 min cooldown between alarms)
    }

    private fun initPolarClient() {
        if (polarBleClient == null) {
            polarBleClient = PolarBleClient(this) { alarmState ->
                watchdog.feed()
                if (alarmState != lastReportedState) {
                    lastReportedState = alarmState
                    when (alarmState) {
                        SeizureAlarmState.WARNING -> updateNotification("⚠️ WARNING: Rhythmic seizure motion detected")
                        SeizureAlarmState.ALARM -> {
                            updateNotification("🚨 ALARM: Prolonged seizure activity confirmed!")
                            triggerEmergencyAlert(isTest = false)
                        }
                        SeizureAlarmState.DISCONNECTED -> updateNotification("Sensor disconnected")
                        SeizureAlarmState.NORMAL -> updateNotification("Monitoring active — Normal")
                    }
                }
            }
        }
    }

    private fun triggerEmergencyAlert(isTest: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!isTest && (now - lastSmsDispatchTimeMs) < SMS_COOLDOWN_MS) {
            DiagnosticManager.log(LogLevel.WARN, "Alert SMS throttled (cooldown active).")
            return
        }
        if (!isTest) {
            lastSmsDispatchTimeMs = now
        }

        DiagnosticManager.log(LogLevel.INFO, "Initiating emergency dispatch (locating + SMS)...")
        val contacts = carerManager.getCarerContacts()
        val patientName = carerManager.getPatientName()
        val telemetry = DiagnosticManager.telemetry.value

        locationProvider.requestFreshPosition { position ->
            val sent = smsDispatcher.dispatchSeizureAlert(
                contacts = contacts,
                patientName = patientName,
                telemetry = telemetry,
                position = position,
                isTest = isTest
            )
            DiagnosticManager.log(LogLevel.INFO, "Emergency dispatch completed: $sent SMS sent.")
        }
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
            if (state != lastReportedState) {
                lastReportedState = state
                updateNotification("Status: $state")
            }
        }

        initPolarClient()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        initPolarClient()
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
            ACTION_START_SCAN -> {
                DiagnosticManager.log(LogLevel.INFO, "Manual scan requested by user.")
                polarBleClient?.startScan()
            }
            ACTION_STOP_SCAN -> {
                polarBleClient?.stopScan()
            }
            ACTION_TEST_SMS_ALERT -> {
                DiagnosticManager.log(LogLevel.INFO, "Manual test SMS alert requested by user.")
                triggerEmergencyAlert(isTest = true)
            }
            ACTION_START -> {
                startMonitoring()
            }
            else -> {
                startMonitoring()
            }
        }
        return START_STICKY
    }

    private fun startMonitoring() {
        initPolarClient()
        DiagnosticManager.updateTelemetry { it.copy(isServiceRunning = true) }
        try {
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hours max
                DiagnosticManager.log(LogLevel.INFO, "Partial WakeLock acquired.")
            }
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

            // If we have a previously connected device remembered, auto-connect immediately.
            // Additionally run startScan() so that if the device needs to be discovered first or
            // re-advertised, discovery will also pick it up and trigger auto-connect.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val client = polarBleClient
                if (client != null) {
                    val attempted = client.autoConnectIfRemembered()
                    if (!attempted) {
                        client.startScan()
                    } else {
                        // Also run background scan to ensure discovery callback can catch advertisement if direct connect needs discovery
                        client.startScan()
                    }
                }
            }, 1200L)
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Error starting foreground service: ${e.localizedMessage}")
        }
    }

    private fun stopMonitoring() {
        DiagnosticManager.updateTelemetry {
            it.copy(
                isServiceRunning = false,
                connectionState = "DISCONNECTED",
                connectedDeviceId = null,
                connectedDeviceName = null,
                batteryLevel = null,
                heartRateBpm = null,
                isStreamingAcc = false,
                isStreamingHr = false
            )
        }
        polarBleClient?.shutDown()
        polarBleClient = null

        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
            DiagnosticManager.log(LogLevel.INFO, "Partial WakeLock released.")
        }
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

        val isAlarmActive = lastReportedState == SeizureAlarmState.ALARM || lastReportedState == SeizureAlarmState.WARNING

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(if (isAlarmActive) "⚠️ Seizure Motion Detected" else getString(R.string.service_notification_title))
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(if (isAlarmActive) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_LOW)

        if (isAlarmActive) {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel Alarm", cancelPendingIntent)
        }

        return builder.build()
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
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.service_notification_desc)
                enableVibration(false)
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
