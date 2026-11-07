# AGENTS.md — Agent & Pair-Programming Guidelines for Polar-Seizure (`ps`)

Welcome to the **Polar-Seizure (`ps`)** codebase. This document outlines operational protocols, architectural tenets, coding standards, and repository conventions for AI agents and human contributors.

---

## 1. Project Mission & Safety-Critical Context
Polar-Seizure is an open-source, continuous physiological and motion telemetry system designed for individuals with seizure disorders (such as generalized tonic-clonic epilepsy). It streams high-frequency 3-axis accelerometer and heart rate data from wearable BLE sensors (Polar Loop Gen2, Polar Verity Sense, Polar H10) into an on-phone Android daemon, running a 3–8 Hz Fast Fourier Transform (FFT) detection algorithm and communicating with a cloud backend to alert carers instantly.

> [!IMPORTANT]
> **Safety-Critical Code Standards Apply:**
> - A missed alert or silent sensor disconnection puts the patient at extreme risk.
> - Code must fail closed (i.e., trigger an alert if telemetry or connectivity is ambiguous).
> - Never swallow errors silently in background services, Bluetooth callbacks, or alert dispatch routines.

---

## 2. Monorepo Organization

```
Polar-Seizure/
├── android-app/             # Native Android Kotlin app with persistent Foreground Service
├── backend-container/       # Cloud API, telemetry ingestion & alert dispatch microservice
├── frontend-container/      # Carer & clinician web portal (React + Vite + Tailwind)
├── pwa-container/           # Archived reference PWA prototype from Google AI Studio
├── fluxcd-dev/              # Kubernetes GitOps manifests (FluxCD Kustomize & Image Policies)
├── spec/                    # System architecture specs and Product Requirement Documents (PRDs)
│   ├── README.md
│   └── prds/                # Numbered PRD files (PRD-001 through PRD-007)
├── .github/workflows/       # CI/CD: PR testing, SHA-tagged container builds, Android APK builds
├── AGENTS.md                # This operational guide
└── README.md                # Monorepo entry point
```

---

## 3. Project Identifier & Naming Conventions
* **Shortcode:** Always use **`ps`** (derived from **Polar-Seizure**).
  * Note: Legacy upstream code from `sward-warden` used `sw`. Replace any occurrences of `sw` or `sward-warden` with `ps` or `polar-seizure`.
* **Package Names:**
  * Android: `org.openseizuredetector.polar` or `io.polar.seizure`
  * Backend: `@polar-seizure/backend`
  * Frontend: `@polar-seizure/frontend`
  * Container Images: `ghcr.io/bengreen/polar-seizure-backend`, `ghcr.io/bengreen/polar-seizure-frontend`

---

## 4. Architecture & Engineering Tenets

### 4.1 Android Application (`android-app`)
* **Language & Framework:** Modern Kotlin with Jetpack Compose, Coroutines, StateFlow, and AndroidX.
* **Background Persistence:** Must execute within an Android Foreground Service (`foregroundServiceType="connectedDevice|dataSync"`) holding a `PARTIAL_WAKE_LOCK`.
* **Bluetooth Handling:** Implement robust reconnection loops with exponential backoff. Handle Android 12+ runtime permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS`).
* **Detection Engine:** 3–8 Hz FFT bandpass power calculation must execute in a background coroutine/thread pool without blocking UI or BLE packet reception.

### 4.2 Backend Service (`backend-container`)
* **Runtime:** Node.js 20+ with TypeScript.
* **Health & Heartbeat:** Implement `/healthz`, `/livez`, and `/api/v1/watchdog/heartbeat`.
* **Dead Man's Timer:** If an active device fails to submit a heartbeat within the configured tolerance window (default: 60s), initiate carer escalation.
* **Alert Escalation:** Support redundant transport adapters (Twilio SMS, Firebase Cloud Messaging, Webhooks).

### 4.3 Web Portal (`frontend-container`)
* **Stack:** Vite + React + Tailwind CSS + Lucide Icons + Recharts.
* **Responsiveness:** Optimized for mobile phones (carers on the go) and desktop clinician monitors.
* **Real-Time Telemetry:** Consumes Server-Sent Events (SSE) or WebSockets from `backend-container` to update live status indicators and the 3–8 Hz spectral visualizer.

### 4.4 Deployment & GitOps (`fluxcd-dev`)
* **GitOps Engine:** FluxCD with Kustomize controller.
* **Immutability:** Never deploy mutable `latest` tags in staging or production. Always track specific commit SHAs (`sha-${COMMIT_SHA:0:7}`).
* **Image Update Automation:** Automated PRs or direct Git commits via Flux `ImageUpdateAutomation` when new SHA images are pushed to GHCR.

---

## 5. Development Workflow & CI/CD Rules
1. **Pull Request Quality Gates:**
   - Every PR triggers `.github/workflows/test-pr.yml`.
   - Must pass linting, type checks (`tsc --noEmit`), and automated unit tests before merge.
2. **Main Branch Artifact Build:**
   - Merges to `main` trigger `.github/workflows/build-artifacts.yml`.
   - Automatically builds multi-arch container images tagged with the commit SHA.
   - Automatically compiles the Android release APK, packages it with the commit SHA label, and attaches it as a GitHub release / workflow artifact.

---

## 6. How Agents Should Work in this Codebase
* **Makefile as Standard Developer & Agent Entry Point:** Always execute builds, tests, linting, and formatting via the top-level `Makefile` targets (e.g. `make test`, `make build`, `make test-be`, `make test-fe`, `make test-android`, `make ps-be-check`, `make pre-commit-run`) rather than invoking subsystem commands directly.
* **Spec-First Changes:** When adding features or changing protocols, review and update the relevant document in `spec/prds/`.
* **Do Not Touch `pwa-container/` for New Features:** `pwa-container` is an archived reference container. Active development happens in `android-app`, `backend-container`, and `frontend-container`.
* **Respect Battery & Memory Constraints:** Any loop or listener in `android-app` must be evaluated for battery impact.
