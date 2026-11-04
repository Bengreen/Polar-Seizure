/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarerSettings, DetectorState } from '../types/seizure';

export interface DispatchResult {
  channel: 'SMS' | 'WEBHOOK' | 'PUSH' | 'VIBRATION';
  recipient?: string;
  success: boolean;
  message: string;
  timestamp: number;
}

class CarerAlertsService {
  /**
   * Request native browser notification permissions
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }

  /**
   * Trigger haptic vibration patterns on Android devices
   */
  triggerVibration(type: 'WARNING' | 'ALARM' | 'DEADMAN') {
    if (!('vibrate' in navigator)) return;

    try {
      if (type === 'WARNING') {
        // Double pulse for warning
        navigator.vibrate([200, 100, 200]);
      } else if (type === 'ALARM') {
        // High urgency rhythmic SOS/emergency pattern
        navigator.vibrate([600, 200, 600, 200, 600, 400, 1200]);
      } else if (type === 'DEADMAN') {
        // Long single buzzing warning
        navigator.vibrate([800, 300, 800]);
      }
    } catch (e) {
      console.warn('Vibration failed:', e);
    }
  }

  /**
   * Dispatch system Push notification
   */
  sendPushNotification(title: string, body: string, urgency: 'high' | 'critical' = 'high'): boolean {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return false;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: 'seizure-detector-alert',
        requireInteraction: true,
        silent: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return true;
    } catch (e) {
      console.warn('Push notification error:', e);
      return false;
    }
  }

  /**
   * Send SMS via Twilio API
   */
  async sendTwilioSms(
    to: string,
    body: string,
    settings: CarerSettings
  ): Promise<{ success: boolean; message: string }> {
    const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = settings;

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      return {
        success: false,
        message: 'Twilio credentials incomplete. Configure Account SID, Auth Token & From Number in Settings.',
      };
    }

    try {
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const formData = new URLSearchParams();
      formData.append('To', to);
      formData.append('From', twilioFromNumber);
      formData.append('Body', body);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return {
        success: true,
        message: `SMS successfully queued via Twilio to ${to}`,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Twilio SMS failed: ${errMsg}`,
      };
    }
  }

  /**
   * Send JSON payload to custom Webhook (Home Assistant, Pushover, Zapier, Make, etc.)
   */
  async sendWebhookAlert(
    webhookUrl: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl) {
      return { success: false, message: 'No webhook URL configured' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return {
        success: true,
        message: `Webhook successfully dispatched to ${webhookUrl}`,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Webhook failed: ${errMsg}`,
      };
    }
  }

  /**
   * Orchestrate full Carer Escalation Alert across all enabled channels
   */
  async dispatchFullEscalation(
    state: DetectorState,
    details: {
      patientName?: string;
      peakRatio?: number;
      peakFrequency?: number;
      deviceName?: string;
      batteryLevel?: number;
      locationNote?: string;
    },
    settings: CarerSettings
  ): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    const now = Date.now();
    const isSeizure = state === 'ALARM';
    const isDeadman = state === 'FAULT_DISCONNECTED' || state === 'FAULT_BATTERY';

    const title = isSeizure
      ? '🚨 EMERGENCY: SEIZURE DETECTED'
      : '⚠️ ALERT: SEIZURE DETECTOR FAULT (DEAD MAN TRIGGERED)';

    const reason = isSeizure
      ? `Rhythmic clonic convulsions detected at ${details.peakFrequency ?? 5.0} Hz (Ratio: ${(details.peakRatio ?? 0.7) * 100}%). Immediate carer assistance required!`
      : `Sensor communication dropped or device battery critically low! OpenSeizureDetector monitoring is currently OFFLINE.`;

    const smsBody = settings.alarmMessageTemplate
      ? settings.alarmMessageTemplate.replace('{reason}', reason)
      : `[OpenSeizureDetector Alert]\n${title}\n${reason}\nTimestamp: ${new Date().toLocaleTimeString()}`;

    // 1. Device Vibration
    this.triggerVibration(isSeizure ? 'ALARM' : 'DEADMAN');
    results.push({
      channel: 'VIBRATION',
      success: true,
      message: 'Haptic emergency pulse triggered',
      timestamp: now,
    });

    // 2. Browser Push Notification
    if (settings.enablePush) {
      const pushSuccess = this.sendPushNotification(title, reason, 'critical');
      results.push({
        channel: 'PUSH',
        success: pushSuccess,
        message: pushSuccess ? 'Push notification delivered' : 'Push notification permission not granted',
        timestamp: now,
      });
    }

    // 3. Webhook Dispatch
    if (settings.customWebhookUrl) {
      const webhookPayload = {
        event: isSeizure ? 'SEIZURE_ALARM' : 'DEADMAN_FAULT',
        title,
        reason,
        timestamp: now,
        isoTime: new Date(now).toISOString(),
        details,
        contacts: settings.contacts,
      };

      const webhookRes = await this.sendWebhookAlert(settings.customWebhookUrl, webhookPayload);
      results.push({
        channel: 'WEBHOOK',
        recipient: settings.customWebhookUrl,
        success: webhookRes.success,
        message: webhookRes.message,
        timestamp: now,
      });
    }

    // 4. SMS Dispatch to configured contacts
    if (settings.enableSms && settings.contacts.length > 0) {
      for (const contact of settings.contacts) {
        if (!contact.phone) continue;

        // If Twilio credentials are configured, send real SMS
        if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
          const smsRes = await this.sendTwilioSms(contact.phone, smsBody, settings);
          results.push({
            channel: 'SMS',
            recipient: `${contact.name} (${contact.phone})`,
            success: smsRes.success,
            message: smsRes.message,
            timestamp: now,
          });
        } else {
          // Simulation / Preview Mode for SMS
          results.push({
            channel: 'SMS',
            recipient: `${contact.name} (${contact.phone})`,
            success: true,
            message: `[Test Simulator] Carer SMS queued: "${smsBody.slice(0, 60)}..." (Configure Twilio in Settings for carrier dispatch)`,
            timestamp: now,
          });
        }
      }
    }

    return results;
  }
}

export const carerAlerts = new CarerAlertsService();
