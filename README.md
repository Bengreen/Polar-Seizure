# Polar-Seizure (`ps`)

Continuous physiological and motion telemetry platform for detecting generalized tonic-clonic seizures and motor seizures using wearable BLE sensors (Polar Loop Gen2, Polar Verity Sense, Polar H10).

---

## 1. System Architecture

```
 Wearable BLE Sensor (Polar Loop Gen2 / Verity / H10)
   │ 25 Hz 3-Axis Accelerometer & Heart Rate Stream
   ▼
 android-app (Persistent Native Android Foreground Daemon)
   │ - Uninterrupted CPU execution with PARTIAL_WAKE_LOCK
   │ - On-device 3-8 Hz FFT Seizure Detection Engine
   │ - Local Dead Man's Watchdog & high-decibel acoustic siren
   ▼
 backend-container (Rust/Axum Cloud Ingestion & Alert Dispatch)
   │ - Ingests telemetry frames & watchdog pings
   │ - Dispatches multi-channel carer alerts (SMS, FCM Push, Webhook)
   │ - Prometheus metrics & HAMS health monitoring (/hams/alive, /hams/ready)
   ▼
 frontend-container (Carer & Clinician Web Dashboard)
   │ - Real-time status cards, 3-8 Hz FFT visualizer & alert management
   ▼
 fluxcd-dev (Kubernetes GitOps Deployment via FluxCD)
   - Tracks immutable SHA-tagged container images automatically
```

---

## 2. Directory Structure

| Directory | Purpose |
|---|---|
| [`android-app/`](android-app/) | Native Kotlin Android application with Foreground Service, Polar BLE SDK, and 3–8 Hz FFT DSP engine. |
| [`backend-container/`](backend-container/) | Cloud backend microservice (Axum/Tokio/Rust) for telemetry ingestion, dead man's watchdog, and carer alert dispatch. |
| [`frontend-container/`](frontend-container/) | Responsive web dashboard (Angular/Tailwind) for carers and medical staff. |
| [`pwa-container/`](pwa-container/) | Archived reference prototype originally created on Google AI Studio. |
| [`fluxcd-dev/`](fluxcd-dev/) | Kubernetes GitOps manifests (Kustomize, HelmRelease, OCIRepository) for FluxCD. |
| [`spec/`](spec/) | Full technical specification and Product Requirement Documents ([`spec/prds/`](spec/prds/)). |
| [`.github/workflows/`](.github/workflows/) | GitHub Actions CI/CD workflows for PR testing, multi-arch Docker image packaging, and SHA-tagged Android APK compilation. |
| [`AGENTS.md`](AGENTS.md) | Architectural rules and development guidelines for AI agents and pair-programmers. |

---

## 3. Engineering Conventions

* **Project Identifier:** `ps` / `polar-seizure` (replacing upstream `sw` / `sward-warden`).
* **CI/CD Tagging:** All container images and Android APK artifacts are tagged with their source Git commit SHA (`sha-${GITHUB_SHA::7}`) and tested during pull requests before promotion to `main`.
* **Deployment Pattern:** FluxCD GitOps with automated image updates.

---

## 4. Getting Started

### 4.1 Android Application (`android-app`)
```bash
cd android-app
# Run unit tests (includes FFT 3-8 Hz seizure detection verification)
./gradlew testDebugUnitTest
# Build APK
./gradlew assembleDebug
```

### 4.2 Backend Service (`backend-container`)
```bash
cd backend-container
# Run locally with cargo
cargo run -- serve --config-path config/dev-config.yaml --secrets-dir secrets/
# Build container image
docker build -t polar-seizure-backend:local .
```

### 4.3 Frontend Web Dashboard (`frontend-container`)
```bash
cd frontend-container
npm install
npm start
```
