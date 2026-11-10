# PRD-003: Seizure Detection DSP & Spectral Analysis Engine

## 1. Algorithmic Principles & OpenSeizureDetector Alignment
Generalized tonic-clonic seizures exhibit repetitive, rhythmic clonic muscle spasms characterized by prominent spectral energy concentrated in the **3 Hz to 8 Hz** band. In contrast, common daily activities (walking, typing, resting, ambient vehicle vibration) produce either low-frequency power (<2 Hz), broadband non-rhythmic noise, or brief non-sustained shocks.

Polar-Seizure explicitly mirrors the proven, deterministic signal processing architecture of **OpenSeizureDetector (OSD)**:
1. **Sampling Frequency:** $f_s = 25\text{ Hz}$ (Nyquist frequency $f_{Nyquist} = 12.5\text{ Hz}$).
2. **Analysis Window Duration:** $T = 5.0\text{ seconds}$ ($N = 125\text{ samples}$ at 25 Hz).
3. **Frequency Bin Resolution:** $\Delta f = \frac{1}{T} = \frac{1}{5.0} = \mathbf{0.2\text{ Hz}}$.
4. **Dual-Metric Thresholding:** Requires both significant movement power in the 3–8 Hz band AND a high ratio of seizure band power relative to total movement power.

---

## 2. Signal Processing Pipeline

```
Raw 3-Axis Accelerometer (X, Y, Z at 25 Hz from Polar Loop Gen2)
   │
   ▼
Vector Magnitude Calculation:
   |a| = sqrt(x^2 + y^2 + z^2) - 1.0g (DC gravity subtraction)
   │
   ▼
Stillness & Battery Gate:
   If variance(|a|) < 0.05g -> Mark NORMAL, BYPASS FFT (Conserves phone CPU/battery)
   │
   ▼
5.0-Second Sliding Window Buffer (125 samples, padded to 128 for Radix-2 FFT)
   │
   ▼
Windowing Function (Hann Window):
   w[n] = 0.5 * (1 - cos(2*pi*n / (N - 1)))
   │
   ▼
Fast Fourier Transform (FFT) -> Power Spectrum:
   P[k] = Real[k]^2 + Imag[k]^2   for k = 1 .. N/2
   │
   ▼
Spectral Metric Integration:
   - ROI Band (3.0 Hz to 8.0 Hz): Bins k in [15 .. 40]
   - ROI Power: Average spectral power in [3.0 Hz .. 8.0 Hz]
   - Total Power: Sum of spectral power in [0.2 Hz .. 12.5 Hz] (Bin 0 DC excluded)
   - Spectral Ratio: (ROI Power / Total Power) * 100%
   │
   ▼
OpenSeizureDetector Dual-Threshold State Machine:
   (ROI Power >= AlarmThresh) AND (Spectral Ratio >= AlarmRatioThresh)
   │
   ▼
Consecutive Window Verification (NORMAL -> WARNING -> ALARM)
```

---

## 3. Mathematical Formulation & Thresholds

### 3.1 Region of Interest (ROI) Power
The 3–8 Hz frequency range encompasses frequencies associated with clonic convulsions. With a 5-second window ($\Delta f = 0.2\text{ Hz}$):
* Lower bin index: $k_{\text{low}} = \frac{3.0\text{ Hz}}{0.2\text{ Hz}} = 15$
* Upper bin index: $k_{\text{high}} = \frac{8.0\text{ Hz}}{0.2\text{ Hz}} = 40$

$$\text{Power}_{\text{ROI}} = \frac{1}{k_{\text{high}} - k_{\text{low}} + 1} \sum_{k = k_{\text{low}}}^{k_{\text{high}}} P[k]$$

**Threshold (`AlarmThresh`):** Sets the minimum acceleration energy required to confirm active physical movement. Default is set to **`100`** (arbitrary power units, configurable between `50` and `900` to adjust for patient sensitivity and false alarm suppression).

### 3.2 Total Spectrum Power & Spectral Ratio
Total spectrum power represents the aggregate dynamic movement across all detectable non-DC frequencies:

$$\text{Power}_{\text{Total}} = \sum_{k = 1}^{N/2} P[k]$$

The spectral ratio isolates rhythmic, concentrated shaking from erratic, broad-spectrum movements (e.g., clapping, scrubbing, driving):

$$\text{Ratio} = \left( \frac{\sum_{k = k_{\text{low}}}^{k_{\text{high}}} P[k]}{\text{Power}_{\text{Total}}} \right) \times 100\%$$

**Threshold (`AlarmRatioThresh`):** Default is set to **`50%`** (0.50). Movement is flagged as seizure-like only if at least 50% of the movement power is concentrated within the 3–8 Hz band.

---

## 4. Classification State Machine & Temporal Validation

To eliminate transient spikes and accidental knocks, the system enforces OpenSeizureDetector's consecutive sample window criteria:

```
                  ┌────────────────────────┐
                  │      NORMAL (Green)    │
                  └───────────┬────────────┘
                              │ Condition met:
                              │ (ROI Power >= AlarmThresh) AND (Ratio >= AlarmRatioThresh)
                              ▼
                  ┌────────────────────────┐
                  │ Window 1 Qualified     │
                  └───────────┬────────────┘
                              │ Condition persists for 2 consecutive windows (>= 10s)
                              ▼
                  ┌────────────────────────┐
                  │     WARNING (Amber)    │  <-- Local chime & haptic alert
                  └───────────┬────────────┘      Wearer can press "Cancel"
                              │
                              │ Condition persists for >= 3 windows (>= 15s)
                              ▼
                  ┌────────────────────────┐
                  │      ALARM (Red)       │  <-- High-decibel audible siren (USAGE_ALARM)
                  └────────────────────────┘      Initiates carer escalation (Phase 2)
```

1. **NORMAL (Green):**
   * Spectral ratio $< 0.50$, ROI power below `AlarmThresh`, or user in resting stillness.
   * Consecutive warning counter resets to 0.
2. **WARNING (Amber):**
   * Both $\text{Power}_{\text{ROI}} \ge \text{AlarmThresh}$ AND $\text{Ratio} \ge 0.50$ sustained for **$N_{\text{warn}} = 2$ consecutive windows** ($\sim 10$ seconds).
   * Emits a low-volume local chime / vibration on the Android device.
   * Displays prominent `"Cancel / I Am OK"` button on phone screen and notification.
3. **ALARM (Red):**
   * Rhythmic condition persists continuously for **$N_{\text{alarm}} \ge 3$ consecutive windows** ($\sim 15$ seconds) without manual cancellation.
   * Triggers max-volume audible alarm siren on Android device (overriding silent mode via `AudioAttributes.USAGE_ALARM`).
   * Generates alert event for local logging and future Phase 2 cloud carer escalation.

---

## 5. Balancing Battery Consumption vs. Real-Time Responsiveness

| Metric | Design Choice | Optimization Benefit |
|---|---|---|
| **Sample Rate ($f_s$)** | **25 Hz** | Halves BLE radio transmission bandwidth and ADC power on Polar Loop Gen2 compared to 50 Hz, while preserving Nyquist ceiling ($12.5\text{ Hz}$) well above the 8 Hz seizure boundary. |
| **Window Duration** | **5.0 seconds** (125 samples) | Provides exact $0.2\text{ Hz}$ bin resolution necessary to isolate 3–8 Hz oscillations without requiring large memory buffers. |
| **Sliding Step / Overlap** | **50% Overlap** (2.5s step) | Balances real-time responsiveness (<2.5s latency between window evaluations) with low CPU utilization on the Android phone. |
| **Stillness / Quiet Gate** | **$\text{Var}(\|a\|) < 0.05g$** | Bypasses FFT computation completely while wearer is resting or sleeping, reducing Android battery consumption to $\le 3.5\%$ per hour. |
| **Offloaded Architecture** | **Sensor $\to$ Phone** | Polar Loop Gen2 only acts as a sensor node; all mathematical and spectral processing runs on the phone. |

---

## 6. Multi-Modal Optical PPG Integration & Advanced Diagnostic Options [Roadmap / Deferred Options]

While 3-axis accelerometer FFT spectral analysis serves as the primary detector for motor clonic convulsions, the continuous dual-channel optical Photoplethysmography (PPG) sensor on the Polar Loop / Polar 360 provides critical multi-modal diagnostic vectors. The following options are specified for incremental implementation:

### 6.1 Autonomic Biomarkers & Heart Rate Variability (HRV)
* **Ictal Tachycardia & Bradycardia:** Over 80% of generalized tonic-clonic and focal seizures cause rapid shifts in the autonomic nervous system. Tracking sudden BPM acceleration concurrent with onset motion accelerates confidence scoring.
* **Beat-to-Beat Variability (RMSSD & PPI):** Sub-second timing between optical pulse systolic peaks provides real-time parasympathetic / sympathetic autonomic tone, enabling pre-ictal detection before motor convulsion begins.

### 6.2 Motion Artifact Rejection via Optical-Kinematic Cross-Correlation
* **The Problem:** Benign daily rhythmic activities (e.g. brushing teeth, scrubbing, using vibrating tools) can mimic 3–8 Hz clonic acceleration and cause false positive alarms.
* **The Solution:** True seizure clonic convulsions generate high muscle rigidity and violent hemodynamic shifts. By cross-correlating optical PPG waveform deformation against accelerometer frequency:
  * If periodic accelerometer signals align directly with optical baseline artifacts without genuine systolic volume expansion, the signal is recognized as non-ictal motion artifact and suppressed.
  * If optical pulse intervals remain coherent or exhibit authentic ictal tachycardia, the alarm is confirmed.

### 6.3 SUDEP Risk Screening & Post-Ictal Respiratory / Perfusion Monitoring
* **Sudden Unexpected Death in Epilepsy (SUDEP):** The primary cause of epilepsy-related mortality, usually occurring post-ictally due to central apnea, hypoventilation, and cardiac arrhythmias.
* **Perfusion Index & Pulse Amplitude:** Tracking AC-to-DC optical ratios immediately post-seizure identifies severe peripheral vasoconstriction or circulatory collapse.
* **Respiratory Rate Extraction (PPG Baseline Modulation):** Slow-frequency baseline modulation (0.1–0.4 Hz) in raw optical photodiode signals tracks breathing rates, enabling the system to trigger urgent SUDEP / respiratory arrest warnings if post-ictal breathing ceases.

### 6.4 Adaptive Telemetry Escalation & Incident Ring Buffer Storage
To achieve continuous battery longevity while capturing all forensic signal data:
1. **Low-Power Intermittent Pulse Sampling:** During routine resting states, optical LEDs duty-cycle on for 15s every 2–5 minutes.
2. **ACC-Triggered Escalation:** The instant movement power $\text{Power}_{\text{ROI}}$ or acceleration variance rises, the optical PPG stream escalates to maximum sampling frequency (22 Hz / 50 Hz).
3. **Forensic Ring Buffer Retention:** The daemon retains a rolling 60-second FIFO buffer of raw uncompressed ACC and PPG samples in memory. On alarm or suspect trigger, the pre-incident window plus the active event and recovery period are persisted to disk and bundled for carer/neurologist review.
