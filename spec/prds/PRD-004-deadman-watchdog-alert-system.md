# PRD-004: Dead Man's Handle & Emergency Alert System

> [!IMPORTANT]
> **Status: Architectural Specification / Deferred Implementation**
> As explicitly instructed, the **Dead Man's Handle** described in this document is **NOT to be implemented in active code yet**. This PRD formalizes the requirements, timeout thresholds, state transitions, and fail-safe protocols so that it can be enabled cleanly in a dedicated future update.
>
> In addition, cloud-side alerting and remote escalation are designated as **Phase 2 Future Integrations**; initial development remains strictly focused on on-device processing and local alarm safety.

---

## 1. Safety Rationale & Fail-Closed Philosophy
In life-critical medical telemetry, a silent system failure carries the same risk profile as an undetected seizure:
1. **Sensor Battery Depletion:** The Polar Loop Gen2 battery discharges during nocturnal monitoring.
2. **BLE Disconnection / Radio Drop:** The Bluetooth link between the Polar Loop Gen2 and the Android phone is severed due to RF interference, distance, or wearable reboot.
3. **Sensor Detachment:** The wristband slips off the patient's wrist or is inadvertently removed.
4. **Phone Failure:** The Android phone runs out of battery, freezes, or kills background execution.
5. **Atonic / Non-Convulsive Seizures:** The patient loses consciousness or collapses without the rhythmic motor shaking required to trigger the 3–8 Hz FFT detector.

To address these vulnerabilities, Polar-Seizure specifies a **Dead Man's Handle** that adheres to a **fail-closed** paradigm: if valid sensor telemetry ceases unexpectedly, the system assumes the user is at risk and initiates an escalation workflow.

---

## 2. Dead Man's Handle Architecture

```
                          ┌────────────────────────┐
                          │ Active Monitoring Loop │
                          └───────────┬────────────┘
                                      │
                                      ▼
                      [Valid 25 Hz ACC Batch Arrives?]
                                     / \
                               YES  /   \  NO
                                   /     \
                                  v       v
         ┌───────────────────────────┐   ┌─────────────────────────────┐
         │ Reset In-Flight Countdown │   │ In-Flight Timer Accumulates │
         │ Timer = 0s                │   └──────────────┬──────────────┘
         └───────────────────────────┘                  │
                                                        │ Elapsed >= 15 seconds
                                                        ▼
                                         ┌─────────────────────────────┐
                                         │ Stage 1: Warning Lost Feed  │
                                         │ - Low-priority local chime  │
                                         │ - Amber persistent banner   │
                                         └──────────────┬──────────────┘
                                                        │
                                                        │ Elapsed >= 30 seconds
                                                        ▼
                                         ┌─────────────────────────────┐
                                         │ Stage 2: Dead Man's Alarm   │
                                         │ - Loud audible siren        │
                                         │ - Full-screen prompt        │
                                         │ - [Phase 2] Cloud Alert     │
                                         └─────────────────────────────┘
```

---

## 3. Detailed Specifications

### 3.1 Local In-Flight Sensor Dead Man's Timer (`android-app`)
* **Watchdog Mechanism:** A hardware-backed high-resolution timer resets every time a valid `PolarAccData` frame arrives from the official Polar BLE SDK.
* **Escalation Thresholds:**
  * **$T_1 = 15\text{ seconds}$ (Warning State):**
    * Notification changes to amber: *"Polar Loop Gen2 Telemetry Lost — Checking connection..."*
    * Emits a subtle local warning chime on the phone to alert the wearer to check wristband placement.
  * **$T_2 = 30\text{ seconds}$ (Critical Dead Man's Trigger):**
    * The service transitions to `CRITICAL_DEADMAN_TRIGGER`.
    * Emits an audible alarm siren via `AudioAttributes.USAGE_ALARM` (bypassing silent/DND profiles).
    * Presents an on-screen dialog: *"Warning: Sensor Disconnected. Tap to reconnect or pause monitoring."*

### 3.2 Graceful "Pause Monitoring" Mode
To avoid nuisance alarms when the wearer charges the Polar Loop Gen2 or takes a bath:
* The user can select **"Pause Monitoring"** in the Android app.
* Monitoring is paused for a configurable duration (15m, 30m, 60m, or until manually resumed).
* During Pause mode, the Dead Man's Handle is temporarily disarmed and the notification displays *"Monitoring Paused (Charging/Resting)"*.
* When the pause timer expires, the app prompts the user to put the band back on and resume.

### 3.3 Cloud Dead Man's Watchdog (`backend-container`) [Phase 2 Future Integration]
* **Heartbeat Ping:** In Phase 2, the `android-app` will send periodic status pings (`POST /api/v1/watchdog/heartbeat`) every 20 seconds over HTTPS/WSS.
* **Cloud Timeout:** If the cloud backend receives no heartbeat for **60 seconds**:
  * Cloud watchdog status transitions to `ESCALATION_DEADMAN`.
  * Multi-tier carer escalation triggers immediately:
    * Primary Carer SMS: *"Polar-Seizure Alert: Telemetry connection lost for [Patient Name] for >60s. Check phone and sensor immediately."*
    * Push notification dispatched to Carer Web Portal and mobile apps.

---

## 4. Emergency Alert Escalation Flow (Phased)

```
[Seizure Alarm OR Dead Man's Critical Trigger Confirmed]
       │
       ├─► Local Device Immediate Alert (Time = 0s):
       │     └─ Max volume acoustic siren + haptic vibration (Override DND via USAGE_ALARM)
       │     └─ 15-second visual countdown with prominent "Cancel / I Am OK" button
       │
       ├─► Phase 1: Direct On-Device Cellular SMS & GPS Dispatch (Time = +15s if uncancelled):
       │     ├─ Step 1: Immediate SMS sent via SmsManager to all registered caregiver numbers:
       │     │    "EMERGENCY: Polar-Seizure detected possible seizure for [Name] at [Time]."
       │     └─ Step 2: High-accuracy GPS lock acquired via FusedLocationProviderClient:
       │          Follow-up SMS sent with Google Maps URL:
       │          "LOCATION: [Name] at https://maps.google.com/?q={lat},{lng} (±{acc}m)"
       │
       └─► Phase 2: Remote Cloud Carer Escalation (Future Backend Integration):
             ├─► Tier 1 (Immediate +15s unacknowledged):
             │     └─ Push notification to Carer Web Portal via SSE / WebSocket
             │     └─ Redundant Twilio cloud SMS gateway (for Wi-Fi-only tablets)
             │
             └─► Tier 2 (Escalation +45s unacknowledged):
                   └─ Automated voice phone call with text-to-speech / backup carer SMS
```

---

## 5. False Alarm Suppression & SMS Rate Limiting
To avoid alarming caregivers unnecessarily and prevent cellular carrier rate-limiting:
* **Mandatory 15-Second Local Abort Window:** Outgoing SMS messages are held in a pending state during the initial 15-second siren countdown. If the wearer touches `"Cancel / I Am OK"`, all outbound SMS messages are cancelled immediately.
* **GPS Cooldown & Rate Limiting:** A hardware cooldown timer (default: 5 minutes) prevents repetitive SMS storming if repeated transient warnings occur in close succession.
* **Delivery Logging:** Each SMS transmission outcome (`RESULT_OK`, `RESULT_ERROR_GENERIC_FAILURE`, `RESULT_ERROR_NO_SERVICE`) is logged to local Room database for clinical audit.
