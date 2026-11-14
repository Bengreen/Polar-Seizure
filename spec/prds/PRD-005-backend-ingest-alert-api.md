# PRD-005: Backend Ingestion & Alert Dispatch API

> [!NOTE]
> **Status: Planned Future Integration (Phase 2)**
> The `backend-container` microservice represents Phase 2 cloud infrastructure. Phase 1 focuses exclusively on the self-contained native Android app (`android-app`) connecting to the Polar Loop Gen2. This document specifies the future cloud API contracts, telemetry schemas, and alert ingestion flows for seamless integration when Phase 2 begins.

---

## 1. Responsibilities
When implemented in Phase 2, the `backend-container` will serve as a lightweight, reliable Node.js / TypeScript microservice responsible for:
1. Receiving continuous telemetry and heartbeat streams from `android-app`.
2. Managing session states (Active Monitoring, Paused, Alarm Triggered, Disconnected).
3. Routing multi-channel notifications (SMS via Twilio, FCM push notifications, Webhooks).
4. Providing real-time event streams (SSE / WebSocket) to `frontend-container`.
5. Persisting historical incidents, telemetry logs, and carer response audit trails.

---

## 2. API Specifications

### 2.1 Telemetry & Heartbeat Ingestion
* **`POST /api/v1/telemetry/frame`**
  * Ingests a single real-time telemetry frame.
  * Payload:
    ```json
    {
      "deviceId": "polar-loop-gen2-001",
      "patientId": "pt-8371",
      "timestamp": 1794046477874,
      "heartRate": 78,
      "batteryPercent": 92,
      "fftRatio": 0.18,
      "maxPowerFreq": 1.4,
      "state": "NORMAL",
      "accSampleCount": 128
    }
    ```
* **`POST /api/v1/telemetry/bulk` & `POST /api/v1/telemetry/emergency`**
  * Ingests batched or emergency fast-path telemetry uploads.
  * In emergency events (seizure alarm, watch triple-tap panic, high-G fall), the client immediately uploads the most recent $M$ seconds (default: 120s) of raw/DSP samples.
  * Features compound de-duplication: samples are keyed by `(user_id, device_id, sample_type, timestamp_ms)` ensuring zero duplicated data points if emergency dumps overlap with scheduled bulk uploads.
  * Returns dynamic synchronization instructions in response:
    ```json
    {
      "status": "success",
      "batch_id": "00000000-0000-0000-0000-000000000101",
      "total_received": 120,
      "ingested_count": 118,
      "deduplicated_count": 2,
      "sync_config": {
        "next_upload_in_seconds": 300,
        "emergency_pre_window_seconds": 120
      }
    }
    ```
* **`GET /api/v1/telemetry/config` & `PUT /api/v1/telemetry/config`**
  * Retrieves and dynamically updates per-user bulk synchronization intervals (`bulk_upload_interval_seconds`, `emergency_pre_event_window_seconds`, `allow_cellular_bulk`).
* **`GET /api/v1/telemetry/users/:user_id/live?since_ms=...&limit=...`**
  * Time-series data retrieval endpoint for Single Page Application (SPA) web portal visualization with role-based access control (patients view their own, carers/support/admin can view assigned patients).
* **`POST /api/v1/watchdog/heartbeat`**
  * Payload:
    ```json
    {
      "deviceId": "polar-loop-gen2-001",
      "timestamp": 1794046477874,
      "batteryLevel": 88,
      "charging": false,
      "serviceStatus": "HEALTHY"
    }
    ```

### 2.2 Alert Dispatch, SMS Incident Logging & Incident Lifecycle
* **`POST /api/v1/alerts/trigger`**
  * Dispatches alert payload when `android-app` confirms seizure threshold or logs an on-device SMS dispatch event.
  * Records SMS dispatch metadata: `sms_dispatched` (boolean), `sms_recipient_count` (int), `sms_recipients` (list of recipient numbers/names), and `sms_body` (full text sent to carers).
  * Records vital biometric snapshots at trigger moment (heart rate in BPM, 3–8 Hz seizure power, energy ratio) and GPS location fix (lat, lon, accuracy, maps URL).
  * Payload:
    ```json
    {
      "device_id": "polar-sense-c342",
      "alert_type": "PANIC",
      "severity": "CRITICAL",
      "trigger_source": "WATCH_TRIPLE_TAP",
      "heart_rate_bpm": 128.5,
      "energy_ratio_pct": 82.4,
      "seizure_band_power": 64.2,
      "latitude": 51.5074,
      "longitude": -0.1278,
      "location_accuracy_meters": 4.5,
      "maps_url": "https://maps.google.com/?q=51.5074,-0.1278",
      "sms_dispatched": true,
      "sms_recipient_count": 2,
      "sms_recipients": [{"name": "Carer One", "phone": "+447123456789"}],
      "sms_body": "[POLAR-SEIZURE PANIC] Patient: Alice | Time: 21:40:00 | HR: 128.5 bpm | Location: https://maps.google.com/?q=51.5074,-0.1278 (±4m)"
    }
    ```
* **`GET /api/v1/alerts/users/:user_id/incidents`**
  * Retrieves all past emergency incidents and SMS dispatch logs for a user/patient.
* **`GET /api/v1/alerts/:alertId/acknowledge`**
* **`POST /api/v1/alerts/:alertId/acknowledge`**
  * Called by carer from web portal to acknowledge and silence escalation.
* **`GET /api/v1/alerts/active`**
  * Returns list of currently active or unacknowledged alarms.
* **`GET /api/v1/alerts/:alertId/window?padding_seconds=90`**
  * Retrieves an emergency alert incident record along with the contiguous telemetry window covering $[-90\text{s}, +90\text{s}]$ ($180\text{s}$ total by default, configurable via `padding_seconds`).
  * Returns:
    ```json
    {
      "incident": {
        "id": "00000000-0000-0000-0000-000000000101",
        "user_id": 88,
        "device_id": "polar-sense-c342",
        "alert_type": "PANIC",
        "severity": "CRITICAL",
        "trigger_source": "WATCH_TRIPLE_TAP",
        "heart_rate_bpm": 132.5,
        "energy_ratio_pct": 82.5,
        "seizure_band_power": 64.2,
        "sms_dispatched": true,
        "sms_recipient_count": 2,
        "triggered_at": "2026-11-14T09:40:00Z"
      },
      "window_before_ms": 90000,
      "window_after_ms": 90000,
      "sample_count": 3,
      "samples": [
        {
          "sample_type": "dsp",
          "timestamp_ms": 1794649155000,
          "heart_rate_bpm": 85.0,
          "energy_ratio_pct": 25.0,
          "seizure_band_power": 0.05,
          "alarm_state": "NORMAL"
        }
      ]
    }
    ```

### 2.3 Real-Time Streaming
* **`GET /api/v1/stream/live` (Server-Sent Events / SSE)**
  * Broadcasts live telemetry frames, connection transitions, and alarms to connected `frontend-container` browser clients.
