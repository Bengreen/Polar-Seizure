# Polar-Seizure (PS) Product Requirement Documents (PRDs)

Welcome to the product requirements index for **Polar-Seizure (`ps`)**, an open-source, high-reliability seizure detection and telemetry system connecting wearable BLE sensors (primarily **Polar Loop Gen2**, alongside fallback support for Polar Verity Sense and Polar H10) to a persistent Android daemon, with future integration hooks for cloud-native backend telemetry and carer alerting.

---

## Architecture Alignment: OpenSeizureDetector Mirrored Processing
Polar-Seizure adopts and mirrors the proven, clinically validated algorithmic principles of the **[OpenSeizureDetector](https://github.com/OpenSeizureDetector)** organisation:
* **25 Hz Sampling Rate:** Optimal trade-off providing $12.5\text{ Hz}$ Nyquist bandwidth (enclosing the 3–8 Hz clonic seizure band) while halving radio and sensor power vs. 50/100 Hz.
* **5.0-Second Windows ($0.2\text{ Hz}$ Bin Resolution):** 125 samples zero-padded or computed directly to isolate rhythmic clonic frequency peaks from broadband motion.
* **Dual-Metric Thresholding:** Requires both significant **Region of Interest (ROI) Power** (movement magnitude) AND high **Spectral Ratio** (seizure band concentration $>50\%$).
* **Consecutive Temporal Validation:** 2 consecutive windows ($\sim 10$s) for Warning; $\ge 3$ windows ($\sim 15$s) for Alarm.
* **Aggressive Battery Minimization:** Wristband acts strictly as an offloaded sensor node with batched BLE transmissions; Android phone employs a stillness gate ($\text{variance} < 0.05g$) to bypass FFT execution when the patient is asleep or quiet.

---

## Document Index & Phased Roadmap

| PRD ID | Title | Status / Phase | Target Component | Description |
|---|---|---|---|---|
| [**PRD-001**](PRD-001-system-overview.md) | **System Architecture & End-to-End Overview** | **Active (Phase 1)** | System-wide | High-level topology, OpenSeizureDetector alignment, personas, and phased delivery. |
| [**PRD-002**](PRD-002-android-ble-telemetry-service.md) | **Android BLE Telemetry & Foreground Service** | **Active (Phase 1)** | `android-app` | Native Android daemon, official Polar BLE SDK (`PolarBleApi`), 25 Hz streaming, battery optimizations. |
| [**PRD-003**](PRD-003-seizure-detection-dsp-engine.md) | **Seizure Detection DSP & Spectral Analysis** | **Active (Phase 1)** | `android-app` / DSP | 3–8 Hz FFT bandpass power, spectral ratio, OpenSeizureDetector dual-thresholding state machine. |
| [**PRD-004**](PRD-004-deadman-watchdog-alert-system.md) | **Dead Man's Handle & Emergency Alerting** | **Specified / Deferred Implementation** | `android-app` / Watchdog | Fail-safe watchdog timer for lost sensor data (Do NOT implement in code yet; formal spec). |
| [**PRD-005**](PRD-005-backend-ingest-alert-api.md) | **Backend Ingestion & Alert Dispatch API** | **Future Integration (Phase 2)** | `backend-container` | Cloud telemetry receiver, cloud watchdog heartbeat, emergency alert dispatch engine. |
| [**PRD-006**](PRD-006-carer-web-portal.md) | **Carer & Clinician Web Portal** | **Future Integration (Phase 2)** | `frontend-container` | Web application for real-time monitoring, FFT visualization, incident history, and emergency settings. |
| [**PRD-007**](PRD-007-ci-cd-gitops-flux.md) | **CI/CD Pipelines, Artifact Packaging & FluxCD** | **Active (Phase 1 & 2)** | DevOps / `.github` / `fluxcd-dev` | SHA-tagged multi-arch container builds, Android APK compilation, PR testing, and FluxCD GitOps. |

---

## Engineering Conventions & Naming

* **Project Identifier:** `ps` / `polar-seizure` (short code replacing upstream `sw` / `sward-warden`).
* **Hardware Target:** **Polar Loop Gen2** wristband via official Polar BLE SDK (`com.github.polarofficial:polar-ble-sdk:5.+` / `6.x`).
* **Core Components:**
  * `android-app`: Native Kotlin Android client with Foreground Service and persistent BLE stack (Phase 1).
  * `backend-container`: Cloud-native API and alert routing daemon (Phase 2).
  * `frontend-container`: Responsive web dashboard for carers and clinicians (Phase 2).
  * `pwa-container`: Archived reference implementation of the initial Google AI Studio prototype.
* **Deployment Pattern:** FluxCD GitOps with SHA-tagged OCI images and automated image update policies.
