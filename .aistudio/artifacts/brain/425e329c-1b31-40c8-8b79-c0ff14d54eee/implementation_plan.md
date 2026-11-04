# OpenSeizureDetector Mobile PWA for Polar Loop Gen2

An installable Android PWA that connects to Polar Loop / BLE sensors to detect epileptic tonic-clonic seizures via 3–8 Hz FFT spectral motion analysis, triggers immediate carer alerts (SMS, Push, Audible Siren), minimizes battery consumption, and incorporates an active dead man's handle watchdog.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed in Phase 1 and define the project blueprint:

- **Deployment Model**: Installable Android Progressive Web App (PWA) with Web Bluetooth API, Screen Wake Lock API for background longevity, and offline service worker.
- **Seizure Detection Engine**: Faithful implementation of the OpenSeizureDetector (OSD) algorithm using 25 Hz 3D accelerometer sampling, Fast Fourier Transform (FFT), 3–8 Hz Region of Interest (ROI) power density, and ROI-to-Total power ratio thresholding.
- **Carer Alert Channels**: Dual-path alerting comprising server-side SMS via Twilio/custom webhook dispatch, browser Push notifications, and continuous high-decibel Web Audio sirens (with override mute).
- **Dead Man's Handle & Watchdog**: Fail-safe connection heartbeat monitor that triggers an immediate carer alarm if BLE data stops streaming for >30s or if phone/sensor battery drops into critical territory (<15%).

---

### 1. Overview & Core Concept

- **What It Does**: Streams real-time 3D accelerometer and heart rate data over Bluetooth Low Energy (BLE) from a Polar Loop Gen2 (with full support for standard BLE Heart Rate/Movement profiles and an integrated High-Fidelity Signal Simulator). Processes movement windows with FFT spectral power analysis to distinguish tonic-clonic seizure tremors (3–8 Hz) from voluntary physical activity (walking, typing, resting). Automatically alerts caregivers via SMS, Push, and emergency sirens when seizure thresholds are breached, and sounds a dead man's alert if the sensor unpairs, battery drops, or monitoring halts.
- **Target Audience / Persona**: Individuals living with epilepsy, nocturnal seizures, or movement-associated seizure risks, and their primary caregivers, family members, and medical monitors.
- **Key Value**: Reliable, battery-optimized, free-and-open wearable seizure detection in a pocketable mobile PWA without requiring proprietary closed-ecosystem monitoring contracts.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Connection & Setup*: Tap "Connect Polar Sensor" to initiate Web Bluetooth pairing with standard BLE filters, or select the "Live Simulator" mode to test detection with synthetic tremor/rest/walking feeds.
  2. *Live Monitoring & Spectral Canvas*: View real-time 3D acceleration waveforms, live 0–12 Hz FFT frequency spectrum highlighting the 3–8 Hz ROI band, current ROI power, and seizure probability ratio.
  3. *Dead Man's Handle & System Health*: Watchdog indicator displaying BLE packet age (heartbeat countdown), wearable battery, and phone battery percentage. A 30s communication loss triggers an escalating fail-safe chime and caregiver warning.
  4. *Alarm Sequence & Emergency Escalation*:
     - *Warning Phase (Yellow)*: 5–10s sustained 3–8 Hz tremor triggers a pre-alarm vibration and 10s cancellation countdown for the user to tap "I am OK" (false alarm prevention).
     - *Alarm Phase (Red)*: Continuous seizure verification immediately sends caregiver SMS, fires push notifications, activates the max-volume siren, and logs the episode timestamp and duration.
  5. *Carer & Alert Settings Drawer*: Configure caregiver phone numbers, Twilio credentials / test webhook, siren tone frequency, alarm sensitivity, and battery conservation modes (display dimming, worker sample rate).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean, medical-grade telemetry interface inspired by clinical monitors and tactical aviation instruments. High-contrast typography optimized for quick glanceability at night or in emergencies.
  - *Color Palette & Tokens*:
    - Canvas (60%): Deep Slate Dark Mode (`bg-slate-950` / `bg-slate-900`) to minimize OLED battery drain on mobile devices. Clean neutral light mode alternative.
    - Structure (30%): Deep indigo/slate surfaces (`bg-slate-900`, borders `border-slate-800/80`) with clean hairline dividers.
    - Semantic Accents (10%):
      - Nominal / Safe: Emerald Green (`text-emerald-400`, `bg-emerald-500/10`)
      - Warning / Tremor: Amber (`text-amber-400`, `bg-amber-500/10`)
      - Seizure Emergency: High-visibility Crimson (`text-rose-400`, `bg-rose-500`)
      - Dead Man's Fault: Electric Orange / Violet (`text-orange-400`)
  - *Typography*:
    - Display / Headings: `Plus Jakarta Sans` font for crisp, confident medical headings.
    - Data & Telemetry: `IBM Plex Mono` / `font-mono tabular-nums` for sample rates, FFT power values, battery levels, and countdown clocks.
  - *Component Styling & Ergonomics*:
    - Strict thumb-zone ergonomics for mobile: Bottom-anchored primary actions (48px+ touch targets), large high-contrast emergency "Cancel Alarm" / "Test Alarm" controls, and compact top telemetry status bar.
    - No decorative pill boxes; clean inline metadata with typographic separators (`·`).

- **Interactive Feedback & Motion**:
  - Micro-vibrations (`navigator.vibrate`) during warning states and button presses.
  - Responsive Web Audio API oscillator synthesis for realistic medical sirens (low-latency, zero external audio file dependencies).
  - Smooth 25 FPS canvas rendering with dynamic throttling when the tab is backgrounded to protect battery life.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Web Bluetooth API + Built-In Signal Simulator**
  - *Chosen Approach*: Support both direct browser Web Bluetooth (`navigator.bluetooth.requestDevice` for Polar GATT services) AND an authentic OpenSeizureDetector signal generator (Normal Rest, Walking, Clonic Seizure 4–6 Hz, Heartbeat Dropout, Low Battery).
  - *Why*: Allows users to run real hardware pairing on Chromium/Android mobile browsers while enabling instant testing, carer verification, and emergency simulation without needing a physical seizure event.
  - *Alternatives Considered*: Native Android APK only (cannot run in standard web preview). PWA provides immediate mobile installation on Android homescreens while retaining open web accessibility.

- **Decision 2: In-Memory Cooley-Tukey Radix-2 FFT Engine**
  - *Chosen Approach*: Lightweight, zero-dependency pure TypeScript Radix-2 FFT implementation operating on 128-sample circular buffers (5.12s window at 25 Hz).
  - *Why*: Eliminates heavy external scientific dependencies, executes in under 0.8ms per window, and maximizes battery longevity on low-power mobile CPU cores.
  - *Alternatives Considered*: Complex WebGL shaders or heavy WASM binaries; excessive memory overhead and battery consumption for a 25 Hz 1D signal.

- **Decision 3: Battery Conservation Architecture (Wake Lock + OLED Dark Mode)**
  - *Chosen Approach*: Utilize the Screen Wake Lock API (`navigator.wakeLock`) to prevent the phone from sleeping while monitoring, paired with an ultra-low-power OLED dark mode, minimal DOM re-renders, and canvas frame skips when stationary.
  - *Why*: Continuous Bluetooth monitoring on Android requires active background execution; Wake Lock prevents OS process suspension while dark theme reduces screen power draw by up to 60%.

- **Decision 4: Dead Man's Handle Multi-Tier Watchdog**
  - *Chosen Approach*: A 1-second interval watchdog evaluating three vital signals: (1) timestamp of last BLE data packet (alarm if >30s elapsed), (2) phone battery level via Battery Status API (warning if <20%, alert if <10%), and (3) wearable reported battery level.
  - *Why*: In seizure monitoring, a silent disconnection is life-threatening. The carer must know within 30 seconds if the band fell off, ran out of charge, or disconnected.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                                    │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐  │
│  │ Polar Loop / BLE Device │          │ Synthetic Seizure Generator │  │
│  │ (Heart Rate & 3D Accel) │          │ (Rest / Walk / 5Hz Seizure) │  │
│  └────────────┬────────────┘          └──────────────┬──────────────┘  │
└───────────────┼──────────────────────────────────────┼─────────────────┘
                │                                      │
                ▼                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BLE & SENSOR STREAM MANAGER                          │
│  - 25 Hz Circular Buffer (128 samples / 5.12s window)                  │
│  - Packet Timestamp Watchdog (Dead Man's Handle)                       │
│  - Battery & Connectivity Telemetry                                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                OPENSEIZUREDETECTOR FFT ENGINE                          │
│  - High-Pass Filter (remove 1G gravity bias)                           │
│  - Radix-2 Fast Fourier Transform (0 to 12.5 Hz spectrum)              │
│  - 3–8 Hz Region of Interest (ROI) Power Density                       │
│  - Spectrum Ratio = (ROI Power / Total Power)                          │
│  - Threshold Evaluator (Warning State -> Alarm State -> Reset)         │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
                    ▼                               ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│           WATCHDOG & FAULT           │  │   CARER ALERT & ALARM HUB    │
│  - 30s Heartbeat Timeout Monitor     │  │  - Web Audio Emergency Siren │
│  - Phone & Band Battery Prober       │  │  - Twilio / Webhook SMS API  │
│  - "Dead Man" Carer Notification     │  │  - Browser Push & Vibration  │
└──────────────────────────────────────┘  └──────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         UI & PWA RUNTIME                               │
│  - Installable Android PWA (vite-plugin-pwa, Manifest, Service Worker) │
│  - Live Spectrum Visualizer (Canvas 3–8 Hz highlighted zone)           │
│  - Status Cards: System State, Heartbeat Age, Battery, Carer Status    │
│  - 10-Second Pre-Alarm "Cancel / False Alarm" Bottom Button            │
│  - Carer Settings, Twilio Credentials, & Sensitivity Controls          │
└────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Structures:
- `SensorSample`: `{ timestamp: number, x: number, y: number, z: number, hr?: number, magnitude: number }`
- `SpectrumAnalysis`: `{ frequencies: number[], powers: number[], roiPower: number, totalPower: number, ratio: number, peakFrequency: number }`
- `DetectorState`: `'IDLE' | 'OK' | 'WARNING' | 'ALARM' | 'FAULT_DISCONNECTED' | 'FAULT_LOW_BATTERY'`
- `CarerConfig`: `{ phoneNumbers: string[], twilioAccountSid: string, twilioAuthToken: string, twilioFromNumber: string, webhookUrl: string, enableSms: boolean, enablePush: boolean, enableSiren: boolean }`
- `WatchdogMetrics`: `{ lastPacketAgeMs: number, phoneBatteryPct: number, deviceBatteryPct: number, wakeLockActive: boolean, isHealthy: boolean }`
