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
1. **Zero-Drop Telemetry:** BLE streams must maintain connection persistence across sleep, Doze, and background states via Android Foreground Service.
2. **Fail-Safe Watchdog:** Missing heartbeats trigger escalating carer alerts within 60 seconds.
3. **Immutability & GitOps:** Every container and Android artifact is tagged with its Git SHA and deployed via FluxCD.
