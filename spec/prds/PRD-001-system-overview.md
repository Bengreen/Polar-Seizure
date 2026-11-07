# PRD-001: Polar-Seizure System Overview & Architecture

## 1. Executive Summary
**Polar-Seizure (`ps`)** is an open-source, continuous physiological and motion monitoring platform engineered to detect generalized tonic-clonic seizures and related motor seizure events in real time.

Initially prototyped as a Progressive Web App (PWA) via Google AI Studio, the architecture proved suboptimal due to mobile browser sandbox constraints:
1. Browser execution suspended when backgrounded or locked.
2. Inability to maintain uninterrupted Bluetooth Low Energy (BLE) GATT connections.
3. Lack of guaranteed wake-lock mechanisms during critical nocturnal monitoring windows.

The production architecture transitions the core collection and detection engine into a **Native Android Application (`android-app`)** with a non-killable Foreground Service, paired with a cloud-native **`backend-container`** and a responsive **`frontend-container`** web portal adapted from the robust microservice patterns of `sward-warden`.

---

## 2. High-Level Architecture

```
+-------------------------------------------------------------------+
| Wearable Sensor (Polar Loop Gen2 / Polar Verity / H10)            |
| - 25 Hz / 50 Hz 3-axis Accelerometer & Heart Rate GATT Stream     |
+---------------------------------+---------------------------------+
                                  | Bluetooth Low Energy (BLE 4.2+)
                                  v
+-------------------------------------------------------------------+
| android-app (Persistent Android Client)                           |
| - Foreground Service with WAKELOCK & persistent notification       |
| - Real-time 3-8 Hz FFT Spectral Seizure Analysis                  |
| - Local Fail-safe Dead Man's Watchdog                             |
| - High-decibel audible alarm tone synthesis                       |
| - Offline rolling buffer (SQLite / Room)                          |
+---------------------------------+---------------------------------+
                                  | HTTPS / WebSocket (JSON Stream)
                                  v
+-------------------------------------------------------------------+
| backend-container (Node.js / TypeScript Microservice)             |
| - Ingests telemetry, battery metrics, and heartbeats              |
| - Carer escalation engine (Twilio SMS / FCM Push / Webhooks)      |
| - Cloud Dead Man's Watchdog (triggers if Android phone dies)      |
| - Time-series persistence (PostgreSQL / SQLite)                   |
+---------------------------------+---------------------------------+
                                  | REST API / Server-Sent Events
                                  v
+-------------------------------------------------------------------+
| frontend-container (React / Vite / Tailwind Web Portal)           |
| - Live carer monitoring & alert status                            |
| - FFT Spectrum Visualizer & Acceleration Vector Graph             |
| - Emergency contact configuration & escalation rules              |
| - Historical incident review & telemetry replay                   |
+-------------------------------------------------------------------+
```

---

## 3. Core Personas
1. **Patient / Wearer:** Requires unobtrusive continuous monitoring, low battery drain on the wearable, and reliable local alarm cancellation if a false positive occurs.
2. **Carers & Family:** Require guaranteed, redundant alerts (SMS, push, phone call) within 10 seconds of a confirmed seizure or lost telemetry connection.
3. **Clinicians / Medical Reviewers:** Require verifiable acceleration logs, spectral distribution charts, and timestamped seizure logs for pharmacological titration.
4. **DevOps / SysAdmin:** Requires automated GitOps deployment via FluxCD, automated multi-arch container builds, and reproducible Android APK packaging.

---

## 4. Operational Requirements & Quality Attributes
* **Availability:** 99.99% monitoring uptime during active session.
* **Latency:** Seizure alarm escalation initiated in $\le 10$ seconds of continuous 3–8 Hz rhythmic movement matching threshold criteria.
* **Battery Life:** $\ge 16$ hours continuous BLE streaming on wearable; $\le 5\%$ per hour on host Android device.
* **Fail-Safe Mechanism:** If BLE disconnects or Android crashes, the Cloud Dead Man's Watchdog escalates an alert within 60 seconds.
