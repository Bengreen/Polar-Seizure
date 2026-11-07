# PRD-003: Seizure Detection DSP & Spectral Analysis Engine

## 1. Algorithmic Principles
Clinical studies and OpenSeizureDetector telemetry demonstrate that generalized tonic-clonic seizures exhibit repetitive, rhythmic clonic bursts in the **3 Hz to 8 Hz** frequency band. Normal daily activities (walking, typing, resting) exhibit either low-frequency power (<2 Hz) or broadband non-rhythmic noise.

---

## 2. Signal Processing Pipeline

```
Raw 3-Axis Accelerometer (X, Y, Z at 25 Hz / 50 Hz)
   │
   ▼
Vector Magnitude Calculation:  |a| = sqrt(x^2 + y^2 + z^2) - 1.0g
   │
   ▼
High-Pass Filter / DC Baseline Subtraction (Cutoff = 0.5 Hz)
   │
   ▼
Sliding Windowing (e.g., 128 samples = ~5.12s at 25 Hz) with 50% overlap
   │
   ▼
Window Function (Hanning or Hamming)
   │
   ▼
Fast Fourier Transform (FFT) -> Power Spectral Density (PSD)
   │
   ▼
Band Energy Integration:
  - Total Power: sum(PSD[0..Nyquist])
  - Seizure Band Power (3 Hz - 8 Hz): sum(PSD[3Hz..8Hz])
  - Spectral Ratio: Seizure Band Power / Total Power
   │
   ▼
Seizure Classification State Machine (OK -> WARNING -> ALARM)
```

---

## 3. Thresholds & Classification States

### 3.1 States
1. **NORMAL (Green):**
   * Spectral ratio $< 0.4$ or acceleration power below movement threshold.
2. **WARNING (Amber):**
   * Spectral ratio $\ge 0.5$ in the 3–8 Hz window for consecutive windows exceeding **Warning Time Limit** (default: 5 seconds).
   * Generates low-volume local pre-alarm chime on Android device.
   * Displays cancel button on screen / persistent notification.
3. **ALARM (Red):**
   * Rhythmic condition persists continuously for **Alarm Time Limit** (default: 10 seconds) without manual cancellation.
   * Triggers max-volume audible alarm siren on Android device (overriding silent mode via `AudioAttributes.USAGE_ALARM`).
   * Dispatches emergency alert payload to `backend-container` for carer notification escalation.

### 3.2 False Positive Suppression
* **High-G Impact Filter:** Sustained falls or single violent impacts are classified differently (fall alarm vs. seizure clonic oscillation).
* **Resting / Stillness Guard:** Low acceleration variance (<0.05g) disables FFT trigger to prevent zero-division artifacts and save battery.
