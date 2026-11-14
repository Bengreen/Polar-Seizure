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

### 2.4 Incident History & Alert Telemetry Window Inspection
* **Dedicated Separate Route & View (`/alerts` or `/incidents`):**
  * Alert inspection is deliberately kept off the main Live Monitoring Dashboard to prevent cluttering real-time monitoring and focus the clinician/carer on incident analysis.
  * Historical log of warning events, confirmed seizures, wearer triple-tap panic events, and dead man's watchdog triggers.
* **Contiguous $\pm 90\text{s}$ ($180\text{s}$ Total) Telemetry Inspection:**
  * Selecting any past alert opens the detailed Incident Inspection visualizer powered by `GET /api/v1/alerts/:alertId/window?padding_seconds=90`.
  * Renders synchronized multi-channel time-series charts displaying the $[-90\text{s}, +90\text{s}]$ window around alert trigger time $T_0$:
    * High-resolution heart rate (BPM) curve with tachycardia onset detection.
    * 3–8 Hz FFT band power and spectral energy ratio % leading up to and following the event.
    * 3-axis accelerometer waveform ($X, Y, Z, |a|$) showing motion signature before, during, and after the trigger.
    * Incident metadata snapshot: GPS coordinates, maps link, SMS recipients and dispatch confirmation, and acknowledgment audit log.
* **Clinician Export:**
  * One-click PDF / CSV export containing acceleration logs, heart rate, and FFT spectrum data for neurological review.

---

## 3. Candidate Clinical & Carer Portal Enhancements [Tentative for Discussion]

### 3.1 1-Page Clinician Neurological Summary PDF (Tentative for Discussion)
* **Objective:** Provide epileptologists and neurologists with a clean, standardized 1-page report for clinical consultations.
* **Content Specification:**
  1. **Compliance & Adherence:** Total hours worn per 24-hour cycle, split into daytime vs. nocturnal sleep epochs.
  2. **Autonomic Vitals:** Resting baseline heart rate curve, circadian dipping patterns, and recorded tachycardic/bradycardic excursions.
  3. **Event Timeline & Spectral Signatures:** Summary table and small spectrogram thumbnails of detected Warning and Alarm epochs (showing 3–8 Hz power and spectral ratio at onset).
  4. **Wearer Log & False Alarm Interventions:** List of events cancelled by the wearer, providing clinical context on daily triggers.
