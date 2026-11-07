# PRD-002: Android BLE Telemetry & Foreground Service

## 1. Problem Statement & Motivation
Progressive Web Apps (PWAs) running in Android Chrome or WebViews suffer from severe execution restrictions:
1. When the phone display sleeps or locks, the OS puts the browser renderer to sleep.
2. Web Bluetooth connections drop and cannot be auto-reconnected without manual user gesture.
3. Web Workers and timers are throttled to save power, breaking real-time signal processing.

For seizure detection, intermittent monitoring is equivalent to no monitoring. The native Android application (`android-app`) is required to guarantee continuous operation 24/7.

---

## 2. Technical Requirements

### 2.1 Android Foreground Service
* **Service Type:** `foregroundServiceType="connectedDevice|dataSync"`
* **Lifecycle:** Managed as `START_STICKY` so the Android runtime restarts the service automatically if terminated under extreme memory pressure.
* **Persistent Notification:** Shows live connection status, battery percentage of wearable, and quick-cancel alarm button.
* **WakeLock Management:** Partial wake lock (`PowerManager.PARTIAL_WAKE_LOCK`) retained during active monitoring sessions to ensure CPU executes FFT calculation loops while screen is dark.
* **Doze Exemption:** Prompts user to request battery optimization whitelist (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).

### 2.2 Bluetooth Low Energy (BLE) Client
* **Target Devices:**
  * Polar Loop Gen2 (Wristband)
  * Polar Verity Sense (Armband optical PPG + 52 Hz accelerometer)
  * Polar H10 (Chest strap ECG + accelerometer)
* **SDK:** Polar BLE SDK (`com.github.polarofficial:polar-ble-sdk:5.+`) and standard GATT fallback.
* **Services & Characteristics:**
  * Heart Rate Measurement (`0x180D`, `0x2A37`)
  * Battery Service (`0x180F`, `0x2A19`)
  * Polar PMD (Polar Measurement Data service for ACC streaming at 25Hz / 50Hz / 100Hz)
* **Auto-Reconnect Loop:**
  * Exponential backoff reconnect policy (1s, 2s, 5s, 10s max backoff).
  * Auto-scan filter based on known MAC address or bonded device name.

### 2.3 Offline Telemetry Cache
* In the event of cellular or Wi-Fi disconnection, all telemetry frames, FFT power metrics, and warning states must be buffered locally in an on-device SQLite / Room database.
* Upon network restoration, telemetry is synchronized with `backend-container` with original device timestamps intact.
