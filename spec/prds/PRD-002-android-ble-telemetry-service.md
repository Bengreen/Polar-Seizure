# PRD-002: Android BLE Telemetry & Foreground Service

## 1. Problem Statement & Motivation
For continuous seizure monitoring, intermittent data reception is equivalent to zero monitoring. The native Android application (`android-app`) is required to maintain continuous, 24/7 connectivity with the wearable wristband while actively minimizing battery consumption on both devices.

Polar-Seizure targets the **Polar Loop Gen2** wristband, interacting via the **official Polar BLE SDK** and mirroring the proven, low-power telemetry streaming approach established by **OpenSeizureDetector**.

---

## 2. Technical Requirements

### 2.1 Android Foreground Service & Power Management
* **Service Type:** `foregroundServiceType="connectedDevice|dataSync"`
* **Lifecycle:** Managed as `START_STICKY` so the Android runtime automatically restarts the service if briefly killed under extreme memory pressure.
* **Persistent Notification:**
  * Displays live connection state, current seizure status (`NORMAL`, `WARNING`, `ALARM`), and wearable battery percentage.
  * Prominent quick-action button: `"Cancel / I Am OK"` to abort false warnings immediately.
* **WakeLock Management:** Partial wake lock (`PowerManager.PARTIAL_WAKE_LOCK`) retained during active monitoring sessions to ensure CPU executes FFT calculation loops while the phone screen is dark.
* **Doze Exemption:** Prompts user to grant battery optimization exemption via `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

### 2.2 Bluetooth Low Energy (BLE) Client & Official Polar SDK
* **Primary Target Wearable:** **Polar Loop Gen2** (Wristband activity tracker with internal 3-axis accelerometer and optical LED display).
  * Secondary / Fallback devices: Polar Verity Sense, Polar H10.
* **Official Polar BLE SDK:**
  * Dependency: `com.github.polarofficial:polar-ble-sdk:5.+` (or latest 6.x).
  * Implementation: `PolarBleApiDefaultImpl.defaultImplementation(context, features)`
  * Configured Features:
    * `PolarBleApi.FEATURE_POLAR_ONLINE_STREAMING` (PMD service for live ACC stream)
    * `PolarBleApi.FEATURE_BATTERY_INFO` (Standard Battery GATT Service `0x180F`)
    * `PolarBleApi.FEATURE_DEVICE_INFO` (Device Information GATT Service `0x180A`)
* **Streaming Negotiation & Settings:**
  1. Listen for device connection: `setApiCallback` triggers `streamingFeaturesReady(deviceId, features)`.
  2. Query supported stream settings: `requestStreamSettings(deviceId, DeviceStreamingFeature.ACC)`.
  3. Configure stream parameters:
     * **Sample Rate:** `25 Hz` (mirrored from OpenSeizureDetector standard; captures up to 12.5 Hz Nyquist frequency, which fully encompasses the 3–8 Hz seizure band while using half the power of 50 Hz).
     * **Resolution:** `16 bit`.
     * **Range:** `±8g`.
  4. Initiate streaming: `startAccStreaming(deviceId, settings)` receiving reactive `PolarAccData` samples with microsecond timestamps.
* **Wristband Battery Telemetry:**
  * Subscribed via `observeBatteryLevel(deviceId)`.
  * Emits battery warnings if wristband level drops below 20% and critical alert at 10%.

### 2.3 Battery Consumption Optimization Strategy (Mirroring OpenSeizureDetector)
To balance continuous 24-hour monitoring with near-real-time alarm latency, the system implements OpenSeizureDetector's multi-tier battery preservation techniques:

1. **Wristband Battery Optimization:**
   * **25 Hz Optimal Sampling:** Avoids the excessive power drain of 50 Hz, 100 Hz, or 200 Hz sampling. 25 Hz provides the exact Nyquist headroom ($12.5\text{ Hz}$) needed for 3–8 Hz seizure detection while preserving 24+ hour battery life on the wristband.
   * **BLE Packet Batching & High ATT MTU:** Samples are batched and transmitted across optimized BLE notification frames (negotiating MTU up to 247 bytes), minimizing Bluetooth radio transmission bursts and maximizing wristband MCU sleep states.
   * **Offloaded Computation:** The wristband performs zero mathematical processing or FFT calculation; it functions purely as an efficient sensor node.
2. **Android Phone App Battery Optimization:**
   * **Stillness / Quiet Gate:** The phone evaluates acceleration magnitude variance $|a|$ over a short window before running the FFT. If the user is resting or asleep (variance $<0.05g$), the computationally expensive FFT loop is bypassed, keeping CPU usage minimal ($\le 3.5\%$ per hour).
   * **Optimized Coroutine Processing:** Sensor packet ingestion and sliding window processing execute on lightweight Kotlin coroutines (`Dispatchers.Default`) without allocating unnecessary temporary objects.

---

## 3. Sensor Telemetry Dead Man's Handle [SPECIFIED / DEFERRED IMPLEMENTATION]
> [!IMPORTANT]
> **Status: Architectural Specification / Deferred Implementation — Do NOT implement in active code yet.**
> This section formalizes the requirement for future activation.

### 3.1 Motivation & Rationale
If the Polar Loop Gen2 battery depletes, the Bluetooth radio drops, or the band slips off the wearer's wrist, the monitoring system must not fail silently. In life-critical medical telemetry, missing data must fail closed.

### 3.2 Watchdog Behavior & Thresholds
* **Telemetry Feed Watchdog:** A hardware-backed countdown timer is reset on every valid batch of accelerometer samples received from `PolarBleApi`.
* **Escalation Stages:**
  1. **Stage 1 — Telemetry Disruption Warning ($T = 15\text{ seconds}$):**
     * If no BLE packets arrive for 15 seconds, the foreground service status changes to `WARNING_SENSOR_LOST`.
     * Triggers a subtle, non-panicking local chime on the phone and updates the persistent notification to amber.
  2. **Stage 2 — Critical Dead Man's Trigger ($T = 30\text{ seconds}$):**
     * If data remains unavailable after 30 seconds, the system transitions to `CRITICAL_DEADMAN_TRIGGER`.
     * Emits a high-volume audible local alarm tone (`USAGE_ALARM`) to alert the wearer and proximate carers that monitoring has ceased.
     * Displays a prominent `"Reconnect / Pause Monitoring"` interface.
* **Safe Pause Mode:**
  * When the wearer intentionally removes the band for bathing or charging, they must explicitly activate "Pause Monitoring" mode in the app. This suspends the Dead Man's Handle without triggering an emergency response.

---

## 4. Offline Telemetry Cache
* In the event of cellular or Wi-Fi disconnection, all telemetry frames, FFT power metrics, and warning states are buffered locally in an on-device SQLite / Room database.
* When future Phase 2 backend integration is activated, buffered frames synchronize with `backend-container` with original device timestamps preserved.
