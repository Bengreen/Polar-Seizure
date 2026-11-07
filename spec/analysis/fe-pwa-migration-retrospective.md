# PWA to Native Android Migration Retrospective

## Context & Background
The initial proof-of-concept for Polar-Seizure was developed as a Progressive Web App (PWA) using Google AI Studio. The intent was rapid prototyping across Android and desktop web browsers using Web Bluetooth API (`navigator.bluetooth`).

---

## Fatal Limitations Identified in PWA Architecture

### 1. Web Bluetooth Disconnection in Background
* **Browser Sandbox Policy:** Mobile browsers (Chrome on Android, WebKit on iOS) suspend Web Workers and pause Web Bluetooth event listeners within 5–30 seconds of the screen turning off or the app moving to the background.
* **No Background Reconnect:** The Web Bluetooth specification explicitly prohibits initiating Bluetooth scans or reconnecting to bonded peripherals without an active user gesture (tap/click). If a BLE connection drops during sleep, the PWA cannot recover automatically.

### 2. Lack of Uninterrupted CPU Execution (WakeLocks)
* The W3C Screen Wake Lock API (`navigator.wakeLock.request('screen')`) only works while the screen remains powered on. If the patient or device locks the screen, the wake lock is released immediately, and JavaScript execution is throttled to near-zero.
* In contrast, Android's `PowerManager.PARTIAL_WAKE_LOCK` keeps the CPU running at full speed for DSP processing while allowing the screen to turn off, conserving device battery.

### 3. Audio & Alarm Suppression by OS
* Web Audio and HTML5 `<audio>` elements are muted or prevented from auto-playing if triggered asynchronously from background timers.
* Android's `AudioAttributes.USAGE_ALARM` allows the native daemon to bypass "Do Not Disturb" (DND) and silent mode to wake the patient and local carers during an emergency.

---

## Architectural Decision
* **Native Android Client (`android-app`):** Handles continuous BLE telemetry acquisition, real-time 3-8 Hz FFT processing, local audible sirens, and local dead man's timer in a persistent Foreground Service.
* **Web Portal (`frontend-container`):** Shifted strictly to a monitoring, management, and historical analysis portal for carers, family members, and clinicians.
* **PWA Container (`pwa-container`):** Preserved in the repository as an archived reference implementation.
