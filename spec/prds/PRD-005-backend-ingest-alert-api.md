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

### 2.2 Alert Dispatch & Incident Lifecycle
* **`POST /api/v1/alerts/trigger`**
  * Dispatches alert payload when `android-app` confirms seizure threshold.
  * Initiates Twilio SMS and push alerts to registered emergency contacts.
* **`POST /api/v1/alerts/:alertId/acknowledge`**
  * Called by carer from web portal to acknowledge and silence escalation.
* **`GET /api/v1/alerts/active`**
  * Returns list of currently active or unacknowledged alarms.

### 2.3 Real-Time Streaming
* **`GET /api/v1/stream/live` (Server-Sent Events / SSE)**
  * Broadcasts live telemetry frames, connection transitions, and alarms to connected `frontend-container` browser clients.
