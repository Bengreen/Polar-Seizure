# PRD-005: Backend Ingestion & Alert Dispatch API

## 1. Responsibilities
The `backend-container` is a lightweight, reliable Node.js / TypeScript microservice responsible for:
1. Receiving continuous telemetry and heartbeat streams from `android-app`.
2. Managing session states (Active Monitoring, Paused, Alarm Triggered, Disconnected).
3. Routing multi-channel notifications (SMS via Twilio, FCM push notifications, Webhooks).
4. Providing real-time event streams (SSE / WebSocket) to `frontend-container`.
5. Persisting historical incidents, telemetry logs, and carer response audit trails.

---

## 2. API Specifications

### 2.1 Telemetry & Heartbeat Ingestion
* **`POST /api/v1/telemetry/frame`**
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
