# PRD-006: Carer & Clinician Web Portal

> [!NOTE]
> **Status: Planned Future Integration (Phase 2)**
> The `frontend-container` web portal represents Phase 2 cloud monitoring infrastructure. Phase 1 focuses on on-device monitoring and local alerting on the Android smartphone. This document specifies the future carer web dashboard, real-time spectral visualizers, and clinician review workflows.

---

## 1. Overview
When activated in Phase 2, the `frontend-container` provides a modern, responsive web portal for family carers, residential care staff, and medical professionals to monitor patient safety, visualize motion frequencies in real time, and manage emergency settings.

---

## 2. Key User Views & Features

### 2.1 Live Monitoring Dashboard
* **Status Pill & Vital Stats:**
  * Real-time connection badge (Connected / Disconnected / Warning / Alarm).
  * Heart rate live readout with tachycardia / bradycardia indicators.
  * Wearable & phone battery gauges with low-battery warnings.
* **Spectral Analysis Widget (FFT Visualizer):**
  * Real-time canvas/SVG frequency bar chart spanning 0 Hz to 12.5 Hz.
  * Visual highlight on the critical **3 Hz – 8 Hz Seizure Band**.
* **3-Axis Acceleration Oscilloscope:**
  * Real-time rolling chart of $|a|$ vector magnitude and raw X, Y, Z channels.

### 2.2 Emergency Response Modal
* When an active seizure alarm is triggered:
  * Full-screen high-contrast visual flashing alert with sound alert in browser.
  * Prominent **"Acknowledge & Confirm Assistance"** button.
  * Direct dialing links for emergency contacts and ambulance dispatch.
  * Live map view showing last reported GPS location from Android device.

### 2.3 Emergency Contacts & Carer Matrix
* Multi-tier escalation management:
  * Tier 1: Primary carer SMS & Push.
  * Tier 2: Secondary carer / neighbor (escalates after 60s if unacknowledged).
  * Tier 3: Emergency response services.

### 2.4 Incident History & Clinician Export
* Historical log of warning events, confirmed seizures, and dead man's watchdog triggers.
* One-click PDF / CSV export containing acceleration logs and FFT spectrum data for neurological review.
