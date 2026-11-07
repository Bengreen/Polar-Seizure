# PRD-004: Dead Man's Watchdog & Emergency Alert System

## 1. Safety Rationale
In life-critical medical telemetry, a silent failure is as dangerous as an unhandled seizure. Potential failure modes:
1. Polar wearable battery depleted or device taken off wrist.
2. Bluetooth radio disabled or radio link disconnected.
3. Android phone runs out of battery, enters hard freeze, or drops network connectivity.
4. Patient loses consciousness without convulsive movement (atonic seizure).

The **Dead Man's Watchdog** provides dual-tier local and cloud-based fail-safe monitoring.

---

## 2. Watchdog Architecture

### 2.1 Local Watchdog (`android-app`)
* **Sensor Heartbeat:** Every valid sample frame resets a local hardware-backed countdown timer (default: 30 seconds).
* **Sensor Disconnect Action:**
  * If no BLE packets arrive within 15 seconds: Notification status turns Yellow ("Sensor Lost").
  * If no packets arrive within 30 seconds: Audible tone prompts user to check wearable.

### 2.2 Cloud Dead Man's Watchdog (`backend-container`)
* **Check-In Ping:** The `android-app` transmits a periodic ping `/api/v1/watchdog/heartbeat` every 20 seconds.
* **Backend Timeout:** If no heartbeat is received within 60 seconds (configurable per patient profile):
  * The cloud watchdog status triggers **ESCALATION_DEADMAN**.
  * Carers are alerted via SMS: *"Polar-Seizure Alert: Telemetry lost for [Patient Name] for >60s. Check phone and sensor immediately."*

---

## 3. Emergency Alert Escalation Matrix

```
[Alarm Triggered]
       │
       ├─► Step 1: Local Device Alert
       │     └─ Max volume acoustic siren + vibration (Override DND)
       │     └─ 15-second countdown with prominent "I Am OK" abort button
       │
       ├─► Step 2: Carer Tier 1 (Immediate)
       │     └─ Push notification to Carer Mobile App / Web Portal
       │     └─ SMS with patient GPS coordinates + timestamp
       │
       └─► Step 3: Carer Tier 2 (Escalation +30s if unacknowledged)
             └─ Automated voice call / backup carer SMS
```
