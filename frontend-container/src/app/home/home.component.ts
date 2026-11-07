import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Observable, of } from 'rxjs';

export interface DeviceTelemetry {
  deviceId: string;
  patientName: string;
  heartRate: number;
  batteryPercent: number;
  fftRatio: number;
  maxPowerFreq: number;
  state: 'NORMAL' | 'WARNING' | 'ALARM' | 'DISCONNECTED';
  lastPing: Date;
}

export interface SeizureAlert {
  id: string;
  patientName: string;
  type: 'CRITICAL_SEIZURE' | 'WATCHDOG_DISCONNECT' | 'PRE_WARNING';
  timestamp: Date;
  details: string;
  acknowledged: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  devices: DeviceTelemetry[] = [
    {
      deviceId: 'POLAR-LOOP2-8371',
      patientName: 'Alex Mercer',
      heartRate: 74,
      batteryPercent: 88,
      fftRatio: 0.14,
      maxPowerFreq: 1.2,
      state: 'NORMAL',
      lastPing: new Date(),
    },
  ];

  activeAlerts: SeizureAlert[] = [];

  trafficLightStatus: 'green' | 'yellow' | 'red' = 'green';
  statusSummary: string = 'All monitored patients safe. Telemetry streams continuous.';

  ngOnInit(): void {
    // Check initial device statuses
    this.updateStatusSummary();
  }

  acknowledgeAlert(alertId: string): void {
    this.activeAlerts = this.activeAlerts.map(a =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    );
    this.updateStatusSummary();
  }

  triggerSimulatedAlarm(): void {
    this.devices[0].state = 'ALARM';
    this.devices[0].fftRatio = 0.82;
    this.devices[0].maxPowerFreq = 4.8;
    this.activeAlerts.unshift({
      id: 'alert-' + Date.now(),
      patientName: 'Alex Mercer',
      type: 'CRITICAL_SEIZURE',
      timestamp: new Date(),
      details: 'Rhythmic 4.8 Hz acceleration detected exceeding threshold for 10s',
      acknowledged: false,
    });
    this.updateStatusSummary();
  }

  resetSimulatedAlarm(): void {
    this.devices[0].state = 'NORMAL';
    this.devices[0].fftRatio = 0.14;
    this.devices[0].maxPowerFreq = 1.2;
    this.activeAlerts = [];
    this.updateStatusSummary();
  }

  private updateStatusSummary(): void {
    const unackCritical = this.activeAlerts.some(
      a => !a.acknowledged && a.type === 'CRITICAL_SEIZURE'
    );
    if (unackCritical || this.devices.some(d => d.state === 'ALARM')) {
      this.trafficLightStatus = 'red';
      this.statusSummary = 'CRITICAL SEIZURE ALARM ACTIVE! Carer attention required!';
    } else if (this.devices.some(d => d.state === 'WARNING')) {
      this.trafficLightStatus = 'yellow';
      this.statusSummary = 'Pre-seizure rhythm or warning threshold reached.';
    } else {
      this.trafficLightStatus = 'green';
      this.statusSummary = 'All monitored patients safe. Continuous BLE telemetry streaming.';
    }
  }
}
