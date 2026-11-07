# Technical Spec 0001: Polar BLE GATT Telemetry Protocol

## 1. Supported Wearable Hardware
* **Polar Loop Gen2:** Wrist-worn activity tracker with 3-axis accelerometer and optical LED display.
* **Polar Verity Sense:** Optical heart rate sensor with internal 52 Hz accelerometer and gyroscope.
* **Polar H10:** Chest strap ECG monitor with internal 200 Hz accelerometer.

---

## 2. Bluetooth GATT Specifications

### 2.1 Standard Services
* **Heart Rate Service:** UUID `0x180D`
  * Heart Rate Measurement Characteristic: UUID `0x2A37`
  * Format: Byte 0 (Flags), Byte 1 (Heart Rate in BPM).
* **Battery Service:** UUID `0x180F`
  * Battery Level Characteristic: UUID `0x2A19`
  * Format: 1-byte unsigned integer (0-100%).

### 2.2 Polar Measurement Data (PMD) Service
* **Service UUID:** `FB005C80-02E7-F387-1CAD-8ACD2D8DF0C8`
* **PMD Control Point:** `FB005C81-02E7-F387-1CAD-8ACD2D8DF0C8` (Write / Indicate)
* **PMD Data Stream:** `FB005C82-02E7-F387-1CAD-8ACD2D8DF0C8` (Notify)

#### Accelerometer Stream Request Frame:
```
[0x02, 0x02, 0x00, 0x01, 0x19, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]
 - 0x02: Command (Start Measurement)
 - 0x02: Measurement Type (ACC)
 - Setting 0x00: Sample Rate 25 Hz (0x19, 0x00)
 - Setting 0x01: Resolution 16 bit (0x10, 0x00)
 - Setting 0x02: Range 8G (0x08, 0x00)
```

### 2.3 Official Polar BLE SDK Integration
While the low-level GATT handles PMD frames, the Android application integrates via the **official Polar BLE SDK** (`com.github.polarofficial:polar-ble-sdk`):
```kotlin
val api: PolarBleApi = PolarBleApiDefaultImpl.defaultImplementation(
    applicationContext,
    setOf(
        PolarBleApi.PolarBleSdkFeature.FEATURE_POLAR_ONLINE_STREAMING,
        PolarBleApi.PolarBleSdkFeature.FEATURE_BATTERY_INFO,
        PolarBleApi.PolarBleSdkFeature.FEATURE_DEVICE_INFO
    )
)

// In streamingFeaturesReady callback:
val settings = mapOf(
    PolarSensorSetting.SettingType.SAMPLE_RATE to 25, // 25 Hz for battery conservation
    PolarSensorSetting.SettingType.RESOLUTION to 16,  // 16 bit
    PolarSensorSetting.SettingType.RANGE to 8         // ±8g
)
api.startAccStreaming(deviceId, PolarSensorSetting(settings))
    .observeOn(Schedulers.computation())
    .subscribe({ polarAccData ->
        // Deliver samples to DSP engine
    }, { error ->
        // Handle stream error
    })
```

---

## 3. Ingestion Payload Schema (`android-app` to `backend-container` [Phase 2])
Transported over HTTPS POST or WebSocket to `/api/v1/telemetry/frame`:

```json
{
  "deviceId": "POLAR-LOOP2-8371",
  "patientId": "pt-8371",
  "timestamp": 1794046477874,
  "heartRate": 74,
  "batteryPercent": 88,
  "fftRatio": 0.18,
  "maxPowerFreq": 1.4,
  "totalPower": 0.082,
  "state": "NORMAL",
  "accSampleCount": 128
}
```
