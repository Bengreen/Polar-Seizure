/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CarerSettings, CarerContact, DetectionConfig } from '../types/seizure';
import {
  Bell,
  Check,
  Plus,
  Save,
  Send,
  Sliders,
  Trash2,
  Users,
  Volume2,
  X,
  Battery,
  Shield,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  carerSettings: CarerSettings;
  onSaveCarerSettings: (settings: CarerSettings) => void;
  detectionConfig: DetectionConfig;
  onSaveDetectionConfig: (config: DetectionConfig) => void;
  onSendTestSms: () => void;
  onTestPush: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  carerSettings,
  onSaveCarerSettings,
  detectionConfig,
  onSaveDetectionConfig,
  onSendTestSms,
  onTestPush,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'carers' | 'algorithm' | 'sms' | 'battery'>('carers');

  // Local state for carer settings
  const [settings, setSettings] = useState<CarerSettings>({ ...carerSettings });
  const [config, setConfig] = useState<DetectionConfig>({ ...detectionConfig });

  // New carer contact form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelationship, setNewRelationship] = useState('Primary Carer');

  const handleAddContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const newContact: CarerContact = {
      id: Date.now().toString(),
      name: newName.trim(),
      phone: newPhone.trim(),
      relationship: newRelationship,
      isPrimary: settings.contacts.length === 0,
    };
    setSettings((prev) => ({
      ...prev,
      contacts: [...prev.contacts, newContact],
    }));
    setNewName('');
    setNewPhone('');
  };

  const handleRemoveContact = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((c) => c.id !== id),
    }));
  };

  const handleSaveAll = () => {
    onSaveCarerSettings(settings);
    onSaveDetectionConfig(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-white">
              Configuration & Carer Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <button
            onClick={() => setActiveTab('carers')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'carers'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Carer Contacts
          </button>
          <button
            onClick={() => setActiveTab('algorithm')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'algorithm'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Seizure Algorithm
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'sms'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            SMS / Twilio API
          </button>
          <button
            onClick={() => setActiveTab('battery')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'battery'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Battery & Watchdog
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {/* TAB 1: CARER CONTACTS */}
          {activeTab === 'carers' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Designated Emergency Carers
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Carers receive immediate SMS and push alerts with seizure duration and location data when convulsions or dead man faults are detected.
                </p>
              </div>

              {/* Existing Contacts List */}
              <div className="space-y-2">
                {settings.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {contact.name}
                        </span>
                        {contact.isPrimary && (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-xs font-mono mt-0.5">
                        {contact.phone} · {contact.relationship}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveContact(contact.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Remove carer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {settings.contacts.length === 0 && (
                  <div className="text-center py-6 text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                    No carers added yet. Add a carer below to enable emergency SMS.
                  </div>
                )}
              </div>

              {/* Add New Carer Contact Form */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="font-semibold text-white text-xs">Add New Carer</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Carer Name (e.g. Sarah)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  <input
                    type="tel"
                    placeholder="Mobile (+44... or +1...)"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
                  />
                  <input
                    type="text"
                    placeholder="Relationship (e.g. Mother)"
                    value={newRelationship}
                    onChange={(e) => setNewRelationship(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
                <button
                  onClick={handleAddContact}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Carer to List</span>
                </button>
              </div>

              {/* Alert Channel Toggles */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="font-semibold text-white text-xs">Alert Dispatch Channels</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-400" />
                      <span>SMS Alerts</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.enableSms}
                      onChange={(e) => setSettings({ ...settings, enableSms: e.target.checked })}
                      className="w-4 h-4 rounded text-rose-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-400" />
                      <span>Push Notifications</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.enablePush}
                      onChange={(e) => setSettings({ ...settings, enablePush: e.target.checked })}
                      className="w-4 h-4 rounded text-rose-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-rose-400" />
                      <span>Audible Emergency Siren</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.enableSiren}
                      onChange={(e) => setSettings({ ...settings, enableSiren: e.target.checked })}
                      className="w-4 h-4 rounded text-rose-500"
                    />
                  </label>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">Test Notifications</span>
                    <button
                      onClick={onTestPush}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px]"
                    >
                      Test Push & Haptics
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ALGORITHM SENSITIVITY */}
          {activeTab === 'algorithm' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  OpenSeizureDetector Algorithm Tuning
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Configure the 3–8 Hz FFT band parameters. Lower thresholds increase sensitivity for subtle nocturnal seizures; higher thresholds prevent false alarms during active daytime exercise.
                </p>
              </div>

              <div className="space-y-4">
                {/* ROI Power Threshold */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-white">ROI Power Threshold</span>
                    <span className="font-mono text-rose-400">{config.roiPowerThreshold} mG²</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Minimum aggregate 3–8 Hz tremor power required to initiate an alarm candidate.
                  </p>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="5"
                    value={config.roiPowerThreshold}
                    onChange={(e) => setConfig({ ...config, roiPowerThreshold: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>50 (Sensitive)</span>
                    <span>120 (OSD Default)</span>
                    <span>300 (Strict)</span>
                  </div>
                </div>

                {/* Ratio Threshold */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-white">Spectrum Ratio Threshold</span>
                    <span className="font-mono text-rose-400">{(config.ratioThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Fraction of total acceleration power that must reside strictly in the 3–8 Hz band.
                  </p>
                  <input
                    type="range"
                    min="0.35"
                    max="0.85"
                    step="0.05"
                    value={config.ratioThreshold}
                    onChange={(e) => setConfig({ ...config, ratioThreshold: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>35% (Broader)</span>
                    <span>55% (Standard)</span>
                    <span>85% (High Specificity)</span>
                  </div>
                </div>

                {/* Pre-alarm cancellation grace window */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-white">Pre-Alarm Grace Window</span>
                    <span className="font-mono text-amber-400">{config.alarmGraceSeconds} seconds</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Time provided for the wearer to tap "I am OK" before emergency carer SMS/sirens fire.
                  </p>
                  <input
                    type="range"
                    min="5"
                    max="20"
                    step="1"
                    value={config.alarmGraceSeconds}
                    onChange={(e) => setConfig({ ...config, alarmGraceSeconds: Number(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>5s (Rapid)</span>
                    <span>10s (Recommended)</span>
                    <span>20s (Extended)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SMS & TWILIO */}
          {activeTab === 'sms' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  SMS Gateway & Custom Webhook
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Enter your Twilio API credentials to dispatch live carrier SMS alerts worldwide, or specify a custom HTTP webhook (Pushover, Home Assistant, Telegram gateway, Zapier).
                </p>
              </div>

              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="font-semibold text-white text-xs mb-1">Twilio API Integration</div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Account SID</label>
                  <input
                    type="text"
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={settings.twilioAccountSid}
                    onChange={(e) => setSettings({ ...settings, twilioAccountSid: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Auth Token</label>
                  <input
                    type="password"
                    placeholder="Your Twilio Auth Token"
                    value={settings.twilioAuthToken}
                    onChange={(e) => setSettings({ ...settings, twilioAuthToken: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Twilio Outbound Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+1234567890"
                    value={settings.twilioFromNumber}
                    onChange={(e) => setSettings({ ...settings, twilioFromNumber: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Custom Webhook */}
              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="font-semibold text-white text-xs mb-1">Alternative Webhook Endpoint</div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">POST URL</label>
                  <input
                    type="url"
                    placeholder="https://api.pushover.net/... or https://maker.ifttt.com/..."
                    value={settings.customWebhookUrl}
                    onChange={(e) => setSettings({ ...settings, customWebhookUrl: e.target.value.trim() })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Test SMS Action */}
              <button
                onClick={onSendTestSms}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-rose-400" />
                <span>Send Test Alert to Carers Now</span>
              </button>
            </div>
          )}

          {/* TAB 4: BATTERY & DEADMAN */}
          {activeTab === 'battery' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Battery Longevity & Dead Man's Watchdog
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Settings to maximize battery life on Android while ensuring the fail-safe watchdog remains active in background.
                </p>
              </div>

              <div className="space-y-4">
                {/* Dead man timeout slider */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-white">Dead Man Timeout</span>
                    <span className="font-mono text-orange-400">{config.deadmanTimeoutSeconds} seconds</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    If no BLE acceleration packet arrives within this duration, an emergency disconnect alarm sounds.
                  </p>
                  <input
                    type="range"
                    min="15"
                    max="60"
                    step="5"
                    value={config.deadmanTimeoutSeconds}
                    onChange={(e) => setConfig({ ...config, deadmanTimeoutSeconds: Number(e.target.value) })}
                    className="w-full accent-orange-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>15s (Aggressive)</span>
                    <span>30s (Default)</span>
                    <span>60s (Lenient)</span>
                  </div>
                </div>

                {/* Min battery threshold */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-white">Low Battery Alert Level</span>
                    <span className="font-mono text-rose-400">{config.minBatteryThreshold}%</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mb-3">
                    Alarms carer if phone or Polar band battery drops below this threshold.
                  </p>
                  <input
                    type="range"
                    min="10"
                    max="25"
                    step="5"
                    value={config.minBatteryThreshold}
                    onChange={(e) => setConfig({ ...config, minBatteryThreshold: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/80 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-colors text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
