# Polar-Seizure (PS) Product Requirement Documents (PRDs)

Welcome to the product requirements index for **Polar-Seizure (`ps`)**, an open-source, high-reliability seizure detection and telemetry system connecting wearable BLE sensors (Polar Loop Gen2, Polar Verity Sense, Polar H10) to a persistent Android daemon, a cloud-native backend container, and a real-time carer web dashboard.

---

## Document Index

| PRD ID | Title | Status | Target Component | Description |
|---|---|---|---|---|
| [**PRD-001**](PRD-001-system-overview.md) | **System Architecture & End-to-End Overview** | Approved | System-wide | High-level system topology, personas, communication protocols, and safety constraints. |
| [**PRD-002**](PRD-002-android-ble-telemetry-service.md) | **Android BLE Telemetry & Foreground Service** | Approved | `android-app` | Native Android foreground daemon, Polar BLE GATT streaming, Doze immunity, and connection resilience. |
| [**PRD-003**](PRD-003-seizure-detection-dsp-engine.md) | **Seizure Detection DSP & Spectral Analysis** | Approved | `android-app` / DSP | 3–8 Hz FFT bandpass power calculation, motion vector magnitude, and seizure classification state machine. |
| [**PRD-004**](PRD-004-deadman-watchdog-alert-system.md) | **Dead Man's Watchdog & Emergency Alerting** | Approved | `android-app` / `backend-container` | Fail-safe watchdog timer, local acoustic alarms, and multi-tier carer escalation (SMS/Push). |
| [**PRD-005**](PRD-005-backend-ingest-alert-api.md) | **Backend Ingestion & Alert Dispatch API** | Approved | `backend-container` | Telemetry receiver, cloud watchdog heartbeat, emergency alert dispatch engine, and audit logging. |
| [**PRD-006**](PRD-006-carer-web-portal.md) | **Carer & Clinician Web Portal** | Approved | `frontend-container` | Web application for real-time monitoring, FFT visualization, incident history, and emergency settings. |
| [**PRD-007**](PRD-007-ci-cd-gitops-flux.md) | **CI/CD Pipelines, Artifact Packaging & FluxCD** | Approved | DevOps / `.github` / `fluxcd-dev` | SHA-tagged multi-arch container builds, Android APK compilation, PR testing, and FluxCD GitOps. |

---

## Engineering Conventions & Naming

* **Project Identifier:** `ps` / `polar-seizure` (short code replacing upstream `sw` / `sward-warden`).
* **Core Containers:**
  * `backend-container`: Cloud-native API and alert routing daemon.
  * `frontend-container`: Responsive web dashboard for carers and clinicians.
  * `pwa-container`: Archived reference implementation of the initial Google AI Studio prototype.
  * `android-app`: Native Kotlin Android client with Foreground Service and persistent BLE stack.
* **Deployment Pattern:** FluxCD GitOps with SHA-tagged OCI images and automated image update policies.
