# Technical Spec 0002: Alert Routing Matrix & Carer Escalation

## 1. Escalation Timeline & States

```
Time 0s: Seizure Alarm Triggered (Continuous 3-8 Hz oscillation >= 10s)
  │
  ├─► Local Action (Phone):
  │     - Max decibel audio siren (USAGE_ALARM bypasses mute)
  │     - Full vibration pulse sequence
  │     - "I am OK" abort countdown button (15 seconds)
  │
  ├─► Backend Ingest:
  │     - POST /api/v1/alerts/trigger
  │     - Dispatches WebSocket / SSE notification to active frontend sessions
  │
Time +15s (If not aborted locally):
  │
  ├─► Primary Carer Escalation (Tier 1):
  │     - Twilio SMS with GPS link and alert details
  │     - Push Notification to mobile devices via Firebase Cloud Messaging
  │
Time +45s (If Tier 1 alert unacknowledged):
  │
  ├─► Secondary Carer Escalation (Tier 2):
  │     - SMS to backup carer / neighbor
  │     - Automated Twilio Voice Call with TTS speech
```

---

## 2. Notification Templates

### 2.1 SMS Alert (Seizure Triggered)
> "EMERGENCY: Polar-Seizure detected possible seizure for [Patient Name] at [Timestamp]. Location: https://maps.google.com/?q=[Lat],[Lon]. Please verify immediately."

### 2.2 SMS Alert (Dead Man's Watchdog Lost Telemetry)
> "WARNING: Polar-Seizure lost connection to [Patient Name]'s sensor for >60 seconds. Check phone and sensor immediately."
