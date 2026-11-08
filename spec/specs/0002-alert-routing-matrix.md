# Technical Spec 0002: Alert Routing Matrix & Carer Escalation

## 1. Escalation Timeline & Phased Architecture

```
Time 0s: Seizure Alarm Triggered (Continuous 3-8 Hz oscillation >= 15s)
  │
  ├─► Local Action (Phone):
  │     - Max decibel audio siren (USAGE_ALARM bypasses mute/DND)
  │     - Vibration sequence
  │     - "Cancel / I Am OK" abort countdown modal (15 seconds)
  │
Time +15s (If not aborted locally):
  │
  ├─► Phase 1: Native On-Device SMS & GPS Dispatch (android.telephony.SmsManager):
  │     ├─ Step 1: Immediate SMS sent to all registered caregiver phone numbers:
  │     │    "EMERGENCY: Polar-Seizure detected possible tonic-clonic seizure for [Name] at [Timestamp]. Acquiring GPS..."
  │     └─ Step 2: High-accuracy location lock obtained via FusedLocationProviderClient:
  │          Follow-up location SMS dispatched with Google Maps URL:
  │          "LOCATION UPDATE: [Name] at https://maps.google.com/?q=[Lat],[Lon] (Accuracy ±[M]m)."
  │
  ├─► Phase 2: Backend Cloud Ingest (Future Integration):
  │     - POST /api/v1/alerts/trigger
  │     - Dispatches WebSocket / SSE notification to active frontend carer sessions
  │
Time +45s (If Tier 1 alert unacknowledged in Phase 2):
  │
  └─► Secondary Carer Escalation (Phase 2):
        - SMS to backup carer / neighbor via Twilio cloud gateway
        - Automated voice call with text-to-speech (TTS) emergency instructions
```

---

## 2. Notification Templates

### 2.1 Native On-Device SMS (Phase 1 — Two-Stage Delivery)

#### Stage 1: Immediate Incident Notification ($T = +15\text{s}$)
> "EMERGENCY: Polar-Seizure detected possible tonic-clonic seizure for [Patient Name] at [HH:mm:ss]. Audio alarm sounding. Acquiring fresh GPS fix..."

#### Stage 2: Location Update SMS ($T \approx +25\text{s}$)
> "LOCATION UPDATE: [Patient Name] located at https://maps.google.com/?q=[Lat],[Lon] (Accuracy: ±[Acc]m). Tap link to open Google Maps navigation."

### 2.2 Native On-Device SMS (Dead Man's Handle Sensor Loss — Stage 2 Trigger)
> "WARNING: Polar-Seizure lost connection to [Patient Name]'s Polar Loop Gen2 for >30 seconds. Sensor data unavailable. Check phone and wearer immediately."

### 2.3 Cloud Gateway SMS (Phase 2 Future Integration)
> "EMERGENCY [Cloud Relay]: Polar-Seizure detected possible seizure for [Patient Name] at [Timestamp]. Location: https://maps.google.com/?q=[Lat],[Lon]. Please verify immediately."

---

## 3. Telephony & Location Technical Parameters

| Component | Specification | Description |
|---|---|---|
| **SMS Framework** | `android.telephony.SmsManager` | Acquired via `context.getSystemService(SmsManager.class)`. |
| **Message Segmentation** | `sendMultipartTextMessage` | Automatically splits and chains messages $>160$ GSM characters. |
| **Carrier Confirmation** | `PendingIntent` (`SMS_SENT`) | Confirms carrier tower handoff; triggers retry on transient radio error. |
| **Location Engine** | `FusedLocationProviderClient` | Priority `PRIORITY_HIGH_ACCURACY` with 15s acquisition timeout. |
| **Location Fallback** | `lastLocation` | If GPS satellite fix times out, uses cached network cell/Wi-Fi location. |
| **Map URL Format** | `https://maps.google.com/?q={lat},{lng}` | Universal deep-link compatible across iOS Apple Maps and Android Google Maps. |
