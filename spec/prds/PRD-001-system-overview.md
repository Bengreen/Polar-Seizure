# PRD-001: Polar-Seizure System Overview & Architecture

## 1. Executive Summary
**Polar-Seizure (`ps`)** is an open-source, continuous physiological and motion monitoring platform engineered to detect generalized tonic-clonic seizures and related motor seizure events in real time.

The system mirrors the proven, clinically validated algorithmic principles of the **OpenSeizureDetector** organization (25 Hz sampling, 5-second windowing, 3–8 Hz Fast Fourier Transform spectral power and ratio analysis) while optimizing battery longevity on both the wearable wristband and the host Android smartphone.

### 1.1 Architectural Evolution & Phased Rollout
1. **Phase 1 (Current Focus — Core Wearable, Local Detection & Direct SMS/GPS Alerting):**
   - Direct integration with the **Polar Loop Gen2** wristband using the **official Polar BLE SDK** (`com.github.polarofficial:polar-ble-sdk`).
   - Native Android daemon (`android-app`) executing within an uninterrupted Foreground Service holding a partial wake lock.
   - On-device real-time 3–8 Hz FFT spectral analysis and dual-threshold classification state machine mirrored from OpenSeizureDetector.
   - **Native On-Device Cellular SMS & GPS Dispatch:** Alerts caregivers directly via `SmsManager` with high-accuracy GPS coordinates (`FusedLocationProviderClient`) without requiring internet or server infrastructure.
   - Battery optimization engine balancing 24+ hour wristband runtime with near-real-time alarm responsiveness.
   - Specification of the local **Dead Man's Handle** for in-flight sensor telemetry loss (*Deferred Implementation — not yet enabled in code*).
2. **Phase 2 (Future Integrations — Cloud Telemetry & Carer Escalation):**
   - Cloud telemetry ingestion and session management via `backend-container`.
   - Multi-tier emergency escalation matrix (Twilio SMS, Firebase Cloud Messaging push, automated voice calls).
   - Cloud-side Dead Man's Watchdog monitoring Android phone connectivity.
   - Clinician and carer real-time web portal via `frontend-container`.

---

## 2. High-Level Architecture

```
+───────────────────────────────────────────────────────────────────+
│ Wearable Sensor: Polar Loop Gen2 (Official Polar BLE SDK)         │
│ - Continuous 3-axis Accelerometer sampled at 25 Hz                │
│ - Batched BLE GATT notifications (Polar Measurement Data - PMD)   │
│ - Battery-optimized radio duty cycle (target: >= 24h continuous)  │
+─────────────────────────────────┬─────────────────────────────────+
                                  │ Bluetooth Low Energy (BLE 4.2+)
                                  ▼
+───────────────────────────────────────────────────────────────────+
│ android-app (Persistent Android Native Client)                    │
│ - Foreground Service (connectedDevice|dataSync|location) + WAKELOCK│
│ - Official Polar BLE SDK Client (PolarBleApi)                     │
│ - OpenSeizureDetector Mirrored DSP Engine:                        │
│     * 25 Hz 3-axis vector magnitude: |a| = sqrt(x^2+y^2+z^2) - 1g │
│     * 5.0s windowing (125 samples, Hann window, 0.2 Hz resolution) │
│     * 3-8 Hz ROI Power & Spectral Ratio calculation               │
│     * Stillness/Resting Gate (bypasses FFT during quiet sleep)    │
│ - Direct On-Device SMS & GPS Dispatcher [PHASE 1 ACTIVE]:         │
│     * Native SmsManager cellular dispatch to caregiver phones     │
│     * FusedLocationProviderClient GPS lock & Google Maps link     │
│     * 15-second local countdown with "Cancel / I Am OK" abort UI  │
│ - Sensor Dead Man's Handle [SPECIFIED / DEFERRED IMPLEMENTATION]: │
│     * Local countdown timer monitoring telemetry arrival          │
│     * Triggers warning at 15s, critical deadman alarm at 30s      │
│ - High-decibel local audible siren (USAGE_ALARM) + cancel UI      │
│ - Offline local buffering (Room / SQLite)                         │
+─────────────────┬───────────────────────────────┬─────────────────+
                  │ Cellular SMS (GSM / LTE)      │ [PHASE 2 - FUTURE]
                  │ Direct to Caregiver Phones    │ HTTPS / WebSocket
                  ▼                               ▼
+───────────────────────────────────+  +────────────────────────────+
│ Caregiver Mobile Phones           │  │ backend-container          │
│ - SMS 1: Seizure Event Alert      │  │ (Future Cloud Microservice)│
│ - SMS 2: GPS Map Coordinates Link │  │ - Multi-tier escalation    │
+───────────────────────────────────+  +────────────────────────────+
```
+───────────────────────────────────────────────────────────────────+
│ backend-container (Future Cloud Microservice)                     │
│ - Ingests telemetry frames, heartbeats, and alert dispatches      │
│ - Multi-tier carer escalation engine (Twilio SMS, FCM Push)       │
│ - Cloud Dead Man's Watchdog (triggers if Android phone dies)      │
│ - Time-series persistence & clinician audit database              │
+─────────────────────────────────┬─────────────────────────────────+
                                  │ [PHASE 2 - FUTURE INTEGRATION]
                                  │ REST API / Server-Sent Events (SSE)
                                  ▼
+───────────────────────────────────────────────────────────────────+
│ frontend-container (Future Carer & Clinician Web Portal)          │
│ - Live monitoring status, heart rate, and battery telemetry       │
│ - 3-8 Hz FFT spectral visualizer & acceleration oscilloscope      │
│ - Incident acknowledgement and emergency contact management       │
+───────────────────────────────────────────────────────────────────+
```

---

## 3. Core Personas
1. **Patient / Wearer:** Requires lightweight, non-intrusive wrist-worn monitoring (Polar Loop Gen2) with day-and-night battery endurance (>24 hours) and reliable local false-alarm cancellation.
2. **Carers & Family:** Require guaranteed fail-safe alerts without silent failures; if sensor falls off or battery dies, the Dead Man's Handle triggers prompt notification.
3. **Clinicians / Medical Reviewers:** Require verifiable frequency domain metrics (3–8 Hz ROI power and spectral ratio) matching clinical seizure detection literature.
4. **DevOps & Developers:** Require a clean modular separation between local on-device safety (Phase 1) and cloud infrastructure (Phase 2), with automated CI/CD and GitOps.

---

## 4. Operational Requirements & Quality Attributes
* **Seizure Detection Responsiveness:** Seizure warning raised within 10 seconds (2 consecutive 5-second windows) and alarm raised within 15 seconds of sustained 3–8 Hz rhythmic motion.
* **Wristband Battery Endurance:** $\ge 24$ hours continuous 25 Hz accelerometer streaming on Polar Loop Gen2 by utilizing BLE notification batching and offloading all FFT computation to the Android smartphone.
* **Smartphone Battery Consumption:** $\le 3.5\%$ battery drain per hour on Android device during continuous monitoring via stillness-gated FFT processing.
* **Fail-Safe Integrity (Dead Man's Handle):** System fails closed. If sensor data stops arriving unexpectedly during an active session, local alerting commences within 15–30 seconds.
* **Phased Independence:** Phase 1 Android detection operates 100% autonomously without requiring internet access or backend availability.

---

## 5. Candidate Feature Enhancements Matrix [Tentative for Discussion]

The following candidate options represent architectural, algorithmic, and operational opportunities identified during ongoing field trials and pairing sessions. They are cataloged here as tentative options for user and clinical review prior to production implementation:

| Category | Candidate Feature | Target Document | Summary Description |
|---|---|---|---|
| **False-Alarm & Usability** | **Wearer Pre-Alarm Grace Screen & Haptic Abort** | [PRD-004](PRD-004-deadman-watchdog-alert-system.md#51-wearer-pre-alarm-grace-window--haptic-abort-tentative-for-discussion) | 10–15 second full-screen countdown with distinct vibration patterns and one-tap abort before dispatching emergency SMS/carer alerts. |
| **False-Alarm & Usability** | **Activity Snooze / Temporary Inactive Profiles** | [PRD-004](PRD-004-deadman-watchdog-alert-system.md#52-activity-snooze--temporary-inactive-profiles-tentative-for-discussion) | Quick 15m/30m/60m pause presets with auto-resume for high-vibration voluntary activities (electric toothbrushes, sports, rough transit). |
| **Reporting & Review** | **In-App Daily Archive Browser & System Share Sheet** | [PRD-002](PRD-002-android-ble-telemetry-service.md#61-in-app-daily-archive-browser--system-share-sheet-tentative-for-discussion) | On-device UI to browse past `.json.gz` daily archives, inspect incident epochs, and share raw or summarized logs via Android Share Sheet. |
| **Reporting & Review** | **1-Page Clinician Neurological Summary PDF** | [PRD-006](PRD-006-carer-web-portal.md#4-candidate-enhancements-matrix-tentative-for-discussion) | Automated one-page clinical summary visualizing daytime vs nocturnal movement, resting HR baseline, tachycardic spikes, and seizure warnings. |
| **Emergency Alerting** | **Bidirectional Carer Acknowledgment Feedback** | [PRD-004](PRD-004-deadman-watchdog-alert-system.md#53-bidirectional-carer-acknowledgment-feedback-tentative-for-discussion) | Returns SMS / push delivery confirmation to the wearer's screen (*"Carer notified & acknowledged at 14:02"*). |
| **Emergency Alerting** | **Low-Battery Carer Escalation** | [PRD-004](PRD-004-deadman-watchdog-alert-system.md#54-low-battery-carer-escalation-tentative-for-discussion) | Escalates alert to carers when wristband drops below $\le 15\%$ or phone drops below $\le 10\%$, preventing unmonitored night-time depletion. |
| **Sensory & DSP** | **Nocturnal Detection Mode (Circadian Auto-Sensitivity)** | [PRD-003](PRD-003-seizure-detection-dsp-engine.md#71-nocturnal-detection-mode-circadian-auto-sensitivity-tentative-for-discussion) | Automatically lowers $\text{AlarmThresh}$ and tightens HR acceleration gating during scheduled sleep hours where voluntary motion is minimal. |
| **Sensory & DSP** | **High-G Fall Detection (Impact + Inactivity)** | [PRD-003](PRD-003-seizure-detection-dsp-engine.md#72-high-g-fall-detection-impact--inactivity-tentative-for-discussion) | Detects severe $>3\text{–}4g$ kinetic impact followed immediately by prolonged motionless flaccidity ($>10\text{s}$) to flag atonic/drop seizures. |
| **Sensory & DSP** | **Optical Off-Wrist / Detached Classification** | [PRD-003](PRD-003-seizure-detection-dsp-engine.md#73-optical-off-wrist--detached-classification-tentative-for-discussion) | Distinguishes between device detachment (PPG DC reflection drops to zero + flat ACC variance) and telemetry failure/dead man's timeout. |
| **Reliability** | **Silent BLE Keep-Alive & Radio Soft-Reset** | [PRD-002](PRD-002-android-ble-telemetry-service.md#62-silent-ble-keep-alive--radio-soft-reset-tentative-for-discussion) | Tracks RSSI health and performs an internal BLE radio/adapter soft-cycle if Android BT daemon drops packets for $>30\text{s}$. |
