# Polar-Seizure (`ps`) System Specification

This directory holds the technical architecture, domain models, protocol definitions, and product requirements for the Polar-Seizure continuous monitoring platform.

---

## Directory Structure

```
spec/
├── README.md                 # This specification navigation file
└── prds/                     # Product Requirement Documents
    ├── README.md             # PRD status matrix & indexing
    ├── PRD-001-system-overview.md
    ├── PRD-002-android-ble-telemetry-service.md
    ├── PRD-003-seizure-detection-dsp-engine.md
    ├── PRD-004-deadman-watchdog-alert-system.md
    ├── PRD-005-backend-ingest-alert-api.md
    ├── PRD-006-carer-web-portal.md
    └── PRD-007-ci-cd-gitops-flux.md
```

---

## Architecture Principles
1. **OpenSeizureDetector Algorithmic Mirroring:** 25 Hz sampling, 5.0-second windowing, 3–8 Hz FFT bandpass energy integration, and dual-metric thresholding (`AlarmThresh` + `AlarmRatioThresh` $> 50\%$).
2. **Aggressive Battery Preservation:** 24+ hour battery life on Polar Loop Gen2 via 25 Hz streaming and batched BLE notifications; phone CPU preserved via resting/stillness gating.
3. **Official Polar BLE SDK Integration:** Seamless lifecycle management, device pairing, and PMD accelerometer streaming via `PolarBleApi`.
4. **Fail-Closed Dead Man's Handle:** If sensor data is interrupted during active monitoring, local alerts trigger within 15–30 seconds (*Specified / Deferred Implementation*).
5. **Phased Delivery:** Phase 1 focuses on self-contained native Android detection and local alerts; Phase 2 introduces cloud backend ingestion, cloud deadman monitoring, and web portal access.
