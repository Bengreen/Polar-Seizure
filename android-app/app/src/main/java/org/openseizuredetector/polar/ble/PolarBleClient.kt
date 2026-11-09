package org.openseizuredetector.polar.ble

import android.content.Context
import com.polar.sdk.api.PolarBleApi
import com.polar.sdk.api.PolarBleApiCallback
import com.polar.sdk.api.PolarBleApiDefaultImpl
import com.polar.sdk.api.model.PolarAccelerometerData
import com.polar.sdk.api.model.PolarDeviceInfo
import com.polar.sdk.api.model.PolarSensorSetting
import io.reactivex.rxjava3.disposables.CompositeDisposable
import io.reactivex.rxjava3.disposables.Disposable
import java.util.UUID
import org.openseizuredetector.polar.dsp.SeizureFftEngine
import org.openseizuredetector.polar.model.SeizureAlarmState

class PolarBleClient(
    private val context: Context,
    private val onAlarmStateChanged: (SeizureAlarmState) -> Unit
) {
    private val disposables = CompositeDisposable()
    private var scanDisposable: Disposable? = null
    private var accStreamDisposable: Disposable? = null

    private val fftEngine = SeizureFftEngine()
    private var connectedDeviceId: String? = null
    private var lastPacketTimestamp: Long = 0
    private var packetCount: Long = 0

    private var lastScanAttemptTime: Long = 0
    private var isScanRetryScheduled: Boolean = false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    companion object {
        private const val MIN_SCAN_INTERVAL_MS = 3000L
        private const val SCAN_RETRY_DELAY_MS = 5000L
    }

    val api: PolarBleApi = PolarBleApiDefaultImpl.defaultImplementation(
        context.applicationContext,
        setOf(
            PolarBleApi.PolarBleSdkFeature.FEATURE_HR,
            PolarBleApi.PolarBleSdkFeature.FEATURE_BATTERY_INFO,
            PolarBleApi.PolarBleSdkFeature.FEATURE_DEVICE_INFO,
            PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_ONLINE_STREAMING
        )
    )

    init {
        setupCallbacks()
    }

    private fun setupCallbacks() {
        api.setApiCallback(object : PolarBleApiCallback() {
            override fun blePowerStateChanged(powered: Boolean) {
                DiagnosticManager.log(
                    if (powered) LogLevel.SUCCESS else LogLevel.WARN,
                    "Bluetooth radio powered state: ${if (powered) "ON" else "OFF"}"
                )
            }

            override fun deviceConnecting(polarDeviceInfo: PolarDeviceInfo) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Connecting to device: ${polarDeviceInfo.name} (${polarDeviceInfo.deviceId})..."
                )
                DiagnosticManager.updateTelemetry {
                    it.copy(
                        connectionState = "CONNECTING",
                        connectedDeviceId = polarDeviceInfo.deviceId,
                        connectedDeviceName = polarDeviceInfo.name
                    )
                }
            }

            override fun deviceConnected(polarDeviceInfo: PolarDeviceInfo) {
                connectedDeviceId = polarDeviceInfo.deviceId
                DiagnosticManager.log(
                    LogLevel.SUCCESS,
                    "Device connected: ${polarDeviceInfo.name} (${polarDeviceInfo.deviceId})"
                )
                DiagnosticManager.updateTelemetry {
                    it.copy(
                        connectionState = "CONNECTED",
                        connectedDeviceId = polarDeviceInfo.deviceId,
                        connectedDeviceName = polarDeviceInfo.name
                    )
                }
            }

            override fun deviceDisconnected(polarDeviceInfo: PolarDeviceInfo) {
                DiagnosticManager.log(
                    LogLevel.WARN,
                    "Device disconnected: ${polarDeviceInfo.name} (${polarDeviceInfo.deviceId})"
                )
                connectedDeviceId = null
                stopAccStreaming()
                DiagnosticManager.updateTelemetry {
                    it.copy(
                        connectionState = "DISCONNECTED",
                        connectedDeviceId = null,
                        connectedDeviceName = null,
                        batteryLevel = null,
                        isStreamingAcc = false
                    )
                }
                onAlarmStateChanged(SeizureAlarmState.DISCONNECTED)
            }

            override fun bleSdkFeatureReady(identifier: String, feature: PolarBleApi.PolarBleSdkFeature) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "BLE feature ready for $identifier: $feature"
                )
                if (feature == PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_ONLINE_STREAMING) {
                    startAccStreaming(identifier)
                }
            }

            override fun batteryLevelReceived(identifier: String, level: Int) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Battery level received for $identifier: $level%"
                )
                DiagnosticManager.updateTelemetry {
                    it.copy(batteryLevel = level)
                }
            }

            override fun disInformationReceived(identifier: String, uuid: UUID, value: String) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Device Info ($identifier): UUID $uuid = $value"
                )
            }

            override fun disInformationReceived(identifier: String, disInfo: com.polar.androidcommunications.api.ble.model.DisInfo) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Device Info ($identifier): ${disInfo.key} = ${disInfo.value}"
                )
            }

            override fun htsNotificationReceived(identifier: String, data: com.polar.sdk.api.model.PolarHealthThermometerData) {
                // Not used
            }
        })
    }

    fun startScan(isRetry: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!isRetry && (now - lastScanAttemptTime) < MIN_SCAN_INTERVAL_MS) {
            DiagnosticManager.log(LogLevel.WARN, "Scan request throttled (last scan was ${(now - lastScanAttemptTime)}ms ago). Please wait.")
            return
        }
        lastScanAttemptTime = now

        stopScan()
        if (!isRetry) {
            DiagnosticManager.clearDevices()
        }
        DiagnosticManager.log(LogLevel.INFO, "Starting BLE scan for nearby Polar devices...")

        scanDisposable = api.searchForDevice()
            .subscribe(
                { deviceInfo ->
                    DiagnosticManager.addOrUpdateDevice(
                        DiscoveredDevice(
                            deviceId = deviceInfo.deviceId,
                            name = deviceInfo.name.ifEmpty { "Polar Device" },
                            rssi = deviceInfo.rssi,
                            isConnectable = deviceInfo.isConnectable
                        )
                    )
                    DiagnosticManager.log(
                        LogLevel.INFO,
                        "Discovered: ${deviceInfo.name} (${deviceInfo.deviceId}) RSSI: ${deviceInfo.rssi} dBm"
                    )
                },
                { error ->
                    val errorMsg = error.localizedMessage ?: error.javaClass.simpleName
                    val isRegistrationError = errorMsg.contains("errorCode: 2") || errorMsg.contains("SCAN_FAILED_APPLICATION_REGISTRATION_FAILED")

                    if (isRegistrationError) {
                        DiagnosticManager.log(
                            LogLevel.ERROR,
                            "BLE scanner registration busy/throttled (ScanCallback errorCode: 2)."
                        )
                        if (!isScanRetryScheduled) {
                            isScanRetryScheduled = true
                            DiagnosticManager.log(
                                LogLevel.WARN,
                                "Android BT daemon busy. Automatically retrying scan in ${SCAN_RETRY_DELAY_MS / 1000}s. You can also connect directly by device ID or toggle Bluetooth OFF/ON in Android Settings."
                            )
                            handler.postDelayed({
                                isScanRetryScheduled = false
                                startScan(isRetry = true)
                            }, SCAN_RETRY_DELAY_MS)
                        }
                    } else {
                        DiagnosticManager.log(
                            LogLevel.ERROR,
                            "BLE Scan error: $errorMsg"
                        )
                    }
                }
            )
        disposables.add(scanDisposable!!)
    }

    fun stopScan() {
        handler.removeCallbacksAndMessages(null)
        isScanRetryScheduled = false
        scanDisposable?.let {
            if (!it.isDisposed) {
                it.dispose()
                DiagnosticManager.log(LogLevel.INFO, "BLE scan stopped.")
            }
        }
        scanDisposable = null
    }

    fun connect(deviceId: String) {
        stopScan()
        try {
            DiagnosticManager.log(LogLevel.INFO, "Requesting connection to $deviceId...")
            api.connectToDevice(deviceId)
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to connect to $deviceId: ${e.localizedMessage}")
        }
    }

    fun disconnect(deviceId: String) {
        try {
            DiagnosticManager.log(LogLevel.INFO, "Disconnecting from $deviceId...")
            api.disconnectFromDevice(deviceId)
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to disconnect $deviceId: ${e.localizedMessage}")
        }
    }

    private fun startAccStreaming(deviceId: String) {
        stopAccStreaming()
        DiagnosticManager.log(LogLevel.INFO, "Requesting ACC stream settings for $deviceId...")

        val streamSettingsDisposable = api.requestStreamSettings(deviceId, PolarBleApi.PolarDeviceDataType.ACC)
            .subscribe(
                { settings ->
                    DiagnosticManager.log(
                        LogLevel.SUCCESS,
                        "Supported ACC settings received from $deviceId: ${settings.settings}"
                    )

                    val desiredSettings = settings.maxSettings()
                    DiagnosticManager.log(
                        LogLevel.INFO,
                        "Starting ACC stream with settings: ${desiredSettings.settings}..."
                    )

                    accStreamDisposable = api.startAccStreaming(deviceId, desiredSettings)
                        .subscribe(
                            { accData ->
                                onAccDataReceived(accData)
                            },
                            { error ->
                                DiagnosticManager.log(
                                    LogLevel.ERROR,
                                    "ACC streaming error: ${error.localizedMessage ?: error.javaClass.simpleName}"
                                )
                                DiagnosticManager.updateTelemetry { it.copy(isStreamingAcc = false) }
                            }
                        )
                    disposables.add(accStreamDisposable!!)
                    DiagnosticManager.updateTelemetry { it.copy(isStreamingAcc = true) }
                },
                { error ->
                    DiagnosticManager.log(
                        LogLevel.WARN,
                        "Could not query ACC settings ($error). Attempting direct default stream..."
                    )
                    accStreamDisposable = api.startAccStreaming(deviceId, PolarSensorSetting(emptyMap()))
                        .subscribe(
                            { accData -> onAccDataReceived(accData) },
                            { streamErr ->
                                DiagnosticManager.log(
                                    LogLevel.ERROR,
                                    "Default ACC stream failed: ${streamErr.localizedMessage}"
                                )
                            }
                        )
                    disposables.add(accStreamDisposable!!)
                }
            )
        disposables.add(streamSettingsDisposable)
    }

    private fun onAccDataReceived(accData: PolarAccelerometerData) {
        val now = System.currentTimeMillis()
        val latency = if (lastPacketTimestamp > 0) now - lastPacketTimestamp else 0
        lastPacketTimestamp = now
        packetCount++

        for (sample in accData.samples) {
            val gx = sample.x / 1000.0
            val gy = sample.y / 1000.0
            val gz = sample.z / 1000.0

            val analysis = fftEngine.addSample(gx, gy, gz)
            if (analysis != null) {
                onAlarmStateChanged(analysis.state)
            }

            val magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz) - 1.0
            val bandPower = fftEngine.getLastBandPower()
            val totalPower = fftEngine.getLastTotalPower()
            val ratio = if (totalPower > 0.0) (bandPower / totalPower) * 100.0 else 0.0

            DiagnosticManager.updateTelemetry {
                it.copy(
                    isStreamingAcc = true,
                    lastPacketLatencyMs = latency,
                    lastAccX = gx,
                    lastAccY = gy,
                    lastAccZ = gz,
                    lastMagnitude = magnitude,
                    seizurePower3to8Hz = bandPower,
                    totalPower = totalPower,
                    energyRatioPercent = ratio,
                    isStillnessGated = bandPower == 0.0 && totalPower == 0.0
                )
            }
        }
    }

    fun stopAccStreaming() {
        accStreamDisposable?.let {
            if (!it.isDisposed) {
                it.dispose()
                DiagnosticManager.log(LogLevel.INFO, "ACC stream stopped.")
            }
        }
        accStreamDisposable = null
    }

    fun shutDown() {
        stopScan()
        stopAccStreaming()
        disposables.clear()
        api.shutDown()
        DiagnosticManager.log(LogLevel.INFO, "PolarBleClient shut down.")
    }
}
