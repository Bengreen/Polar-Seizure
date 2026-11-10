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
    private var hrStreamDisposable: Disposable? = null
    private var ppiStreamDisposable: Disposable? = null

    private val fftEngine = SeizureFftEngine()
    private var connectedDeviceId: String? = null
    private var lastPacketTimestamp: Long = 0
    private var packetCount: Long = 0
    private var lastChartSampleTime: Long = 0

    private var lastScanAttemptTime: Long = 0
    private var isScanRetryScheduled: Boolean = false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    companion object {
        private const val MIN_SCAN_INTERVAL_MS = 3000L
        private const val SCAN_RETRY_DELAY_MS = 5000L
        // Chart window: 30 seconds at 10 Hz sampling rate = 300 points
        private const val CHART_SAMPLE_INTERVAL_MS = 100L
        private const val CHART_MAX_POINTS = 300
        // HR usually reports 1 Hz; keep up to 35 seconds of HR history (~35 points)
        private const val HR_MAX_POINTS = 35
    }

    val api: PolarBleApi = PolarBleApiDefaultImpl.defaultImplementation(
        context.applicationContext,
        setOf(
            PolarBleApi.PolarBleSdkFeature.FEATURE_HR,
            PolarBleApi.PolarBleSdkFeature.FEATURE_BATTERY_INFO,
            PolarBleApi.PolarBleSdkFeature.FEATURE_DEVICE_INFO,
            PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_ONLINE_STREAMING,
            PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_SDK_MODE
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

            override fun hrNotificationReceived(identifier: String, sample: com.polar.sdk.api.model.PolarHrData.PolarHrSample) {
                val now = System.currentTimeMillis()
                DiagnosticManager.updateTelemetry { current ->
                    val updatedHrHistory = current.hrHistory.toMutableList()
                    updatedHrHistory.add(HrHistoryPoint(timestamp = now, bpm = sample.hr))
                    if (updatedHrHistory.size > HR_MAX_POINTS) {
                        updatedHrHistory.removeAt(0)
                    }
                    current.copy(
                        isStreamingHr = true,
                        heartRateBpm = sample.hr,
                        hrHistory = updatedHrHistory
                    )
                }
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
                stopHrStreaming()
                DiagnosticManager.updateTelemetry {
                    it.copy(
                        connectionState = "DISCONNECTED",
                        connectedDeviceId = null,
                        connectedDeviceName = null,
                        batteryLevel = null,
                        heartRateBpm = null,
                        isStreamingAcc = false,
                        isStreamingHr = false
                    )
                }
                onAlarmStateChanged(SeizureAlarmState.DISCONNECTED)
            }

            override fun bleSdkFeatureReady(identifier: String, feature: PolarBleApi.PolarBleSdkFeature) {
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "BLE feature ready for $identifier: $feature"
                )
                when (feature) {
                    PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_ONLINE_STREAMING -> {
                        queryAvailableStreamsAndStart(identifier)
                    }
                    PolarBleApi.PolarBleSdkFeature.FEATURE_HR -> {
                        // Delay HR start slightly so ACC PMD negotiation completes first without control point contention
                        handler.postDelayed({
                            startHrStreaming(identifier)
                        }, 1000L)
                    }
                    else -> {}
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
        DiagnosticManager.log(LogLevel.INFO, "Disconnect requested for $deviceId. Stopping streams...")
        stopAccStreaming()
        stopHrStreaming()
        stopPpiStreaming()
        try {
            DiagnosticManager.log(LogLevel.INFO, "Calling api.disconnectFromDevice($deviceId)...")
            api.disconnectFromDevice(deviceId)
            // Proactively update telemetry so UI state reflects immediate disconnection intent
            if (connectedDeviceId == deviceId) {
                connectedDeviceId = null
                DiagnosticManager.updateTelemetry {
                    it.copy(
                        connectionState = "DISCONNECTED",
                        connectedDeviceId = null,
                        connectedDeviceName = null,
                        batteryLevel = null,
                        heartRateBpm = null,
                        isStreamingAcc = false,
                        isStreamingHr = false
                    )
                }
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to disconnect $deviceId: ${e.localizedMessage}")
        }
    }

    private fun queryAvailableStreamsAndStart(deviceId: String) {
        val queryDisposable = api.getAvailableOnlineStreamDataTypes(deviceId)
            .subscribe(
                { availableTypes ->
                    DiagnosticManager.log(
                        LogLevel.SUCCESS,
                        "Online stream data types supported by $deviceId: $availableTypes"
                    )
                    if (availableTypes.contains(PolarBleApi.PolarDeviceDataType.ACC)) {
                        startAccStreaming(deviceId)
                    } else {
                        DiagnosticManager.log(
                            LogLevel.WARN,
                            "$deviceId does not support real-time ACC online streaming (available: $availableTypes)."
                        )
                    }
                    if (availableTypes.contains(PolarBleApi.PolarDeviceDataType.PPI)) {
                        startPpiStreaming(deviceId)
                    }
                },
                { error ->
                    DiagnosticManager.log(
                        LogLevel.WARN,
                        "Could not query available stream types ($error). Attempting direct ACC stream..."
                    )
                    startAccStreaming(deviceId)
                }
            )
        disposables.add(queryDisposable)
    }

    private fun startAccStreaming(deviceId: String) {
        stopAccStreaming()
        DiagnosticManager.log(LogLevel.INFO, "Enabling SDK mode for $deviceId to configure ACC stream...")

        val sdkModeDisposable = api.enableSDKMode(deviceId)
            .onErrorComplete()
            .subscribe(
                {
                    DiagnosticManager.log(LogLevel.INFO, "SDK mode enabled (or skipped). Requesting ACC stream settings for $deviceId...")
                    requestAndStartAccStream(deviceId)
                },
                { error ->
                    DiagnosticManager.log(LogLevel.WARN, "enableSDKMode error: ${error.localizedMessage}. Proceeding to request ACC settings directly...")
                    requestAndStartAccStream(deviceId)
                }
            )
        disposables.add(sdkModeDisposable)
    }

    private fun requestAndStartAccStream(deviceId: String) {
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

            // Time-based chart sampling: record 1 point every 100ms for a true 30-second window (300 points)
            val shouldRecordChartPoint = (now - lastChartSampleTime) >= CHART_SAMPLE_INTERVAL_MS
            val historyPoint = if (shouldRecordChartPoint) {
                lastChartSampleTime = now
                AccelHistoryPoint(
                    timestamp = now,
                    x = gx.toFloat(),
                    y = gy.toFloat(),
                    z = gz.toFloat(),
                    magnitude = magnitude.toFloat(),
                    energyRatio = ratio.toFloat()
                )
            } else null

            DiagnosticManager.updateTelemetry { current ->
                val newHistory = if (historyPoint != null) {
                    val updated = current.accelHistory.toMutableList()
                    updated.add(historyPoint)
                    if (updated.size > CHART_MAX_POINTS) {
                        updated.removeAt(0)
                    }
                    updated
                } else {
                    current.accelHistory
                }

                current.copy(
                    isStreamingAcc = true,
                    lastPacketLatencyMs = latency,
                    lastAccX = gx,
                    lastAccY = gy,
                    lastAccZ = gz,
                    lastMagnitude = magnitude,
                    seizurePower3to8Hz = bandPower,
                    totalPower = totalPower,
                    energyRatioPercent = ratio,
                    isStillnessGated = bandPower == 0.0 && totalPower == 0.0,
                    accelHistory = newHistory
                )
            }
        }
    }

    private fun startHrStreaming(deviceId: String) {
        stopHrStreaming()
        DiagnosticManager.log(LogLevel.INFO, "Starting HR stream for $deviceId...")

        hrStreamDisposable = api.startHrStreaming(deviceId)
            .subscribe(
                { hrData ->
                    val now = System.currentTimeMillis()
                    for (sample in hrData.samples) {
                        DiagnosticManager.updateTelemetry { current ->
                            val updatedHrHistory = current.hrHistory.toMutableList()
                            updatedHrHistory.add(HrHistoryPoint(timestamp = now, bpm = sample.hr))
                            if (updatedHrHistory.size > HR_MAX_POINTS) {
                                updatedHrHistory.removeAt(0)
                            }
                            current.copy(
                                isStreamingHr = true,
                                heartRateBpm = sample.hr,
                                hrHistory = updatedHrHistory
                            )
                        }
                    }
                },
                { error ->
                    DiagnosticManager.log(
                        LogLevel.WARN,
                        "HR stream unavailable or failed for $deviceId: ${error.localizedMessage ?: error.javaClass.simpleName}"
                    )
                    DiagnosticManager.updateTelemetry { it.copy(isStreamingHr = false) }
                }
            )
        disposables.add(hrStreamDisposable!!)
    }

    fun stopHrStreaming() {
        hrStreamDisposable?.let {
            if (!it.isDisposed) {
                it.dispose()
                DiagnosticManager.log(LogLevel.INFO, "HR stream stopped.")
            }
        }
        hrStreamDisposable = null
    }

    private fun startPpiStreaming(deviceId: String) {
        stopPpiStreaming()
        DiagnosticManager.log(LogLevel.INFO, "Starting PPI optical stream for $deviceId...")

        ppiStreamDisposable = api.startPpiStreaming(deviceId)
            .subscribe(
                { ppiData ->
                    val now = System.currentTimeMillis()
                    for (sample in ppiData.samples) {
                        // Accept samples that are not marked as motion blocker artifacts and have valid HR
                        if (sample.hr > 0 && !sample.blockerBit) {
                            DiagnosticManager.updateTelemetry { current ->
                                val updatedHrHistory = current.hrHistory.toMutableList()
                                updatedHrHistory.add(HrHistoryPoint(timestamp = now, bpm = sample.hr))
                                if (updatedHrHistory.size > HR_MAX_POINTS) {
                                    updatedHrHistory.removeAt(0)
                                }
                                current.copy(
                                    isStreamingHr = true,
                                    heartRateBpm = sample.hr,
                                    hrHistory = updatedHrHistory
                                )
                            }
                        }
                    }
                },
                { error ->
                    DiagnosticManager.log(
                        LogLevel.WARN,
                        "PPI stream failed for $deviceId: ${error.localizedMessage ?: error.javaClass.simpleName}"
                    )
                }
            )
        disposables.add(ppiStreamDisposable!!)
    }

    fun stopPpiStreaming() {
        ppiStreamDisposable?.let {
            if (!it.isDisposed) {
                it.dispose()
                DiagnosticManager.log(LogLevel.INFO, "PPI stream stopped.")
            }
        }
        ppiStreamDisposable = null
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
        stopHrStreaming()
        stopPpiStreaming()
        disposables.clear()
        api.shutDown()
        DiagnosticManager.log(LogLevel.INFO, "PolarBleClient shut down.")
    }
}
