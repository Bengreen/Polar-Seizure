/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BluetoothDeviceInfo, bluetooth } from '../services/bluetooth';
import { Bluetooth, Compass, Gauge, RefreshCw, Zap, ShieldCheck, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { StreamDebugConsole } from './StreamDebugConsole';

interface PolarBleInspectorCardProps {
  deviceInfo: BluetoothDeviceInfo | null;
  isBleConnected: boolean;
  onRefreshBattery?: () => void;
}

export const PolarBleInspectorCard: React.FC<PolarBleInspectorCardProps> = ({
  deviceInfo,
  isBleConnected,
}) => {
  const [isCommandPending, setIsCommandPending] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleStartGyro = async () => {
    setIsCommandPending(true);
    setActionFeedback(null);
    try {
      const ok = await bluetooth.startGyroStream();
      setActionFeedback(
        ok
          ? 'Gyroscope stream negotiated and activated (0x05)'
          : 'Gyroscope (0x05) not supported by Polar Loop 2 hardware; stream cascaded to Accelerometer (0x02)'
      );
    } catch (e) {
      setActionFeedback(`Gyro error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCommandPending(false);
    }
  };

  const handleStartAcc = async () => {
    setIsCommandPending(true);
    setActionFeedback(null);
    try {
      const ok = await bluetooth.startAccStream();
      setActionFeedback(
        ok
          ? 'Accelerometer stream negotiated and activated (0x02)'
          : 'ACC stream command sent'
      );
    } catch (e) {
      setActionFeedback(`ACC error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCommandPending(false);
    }
  };

  const handleRestartStream = async () => {
    setIsCommandPending(true);
    setActionFeedback(null);
    try {
      const ok = await bluetooth.restartStream();
      setActionFeedback(
        ok
          ? 'Stream cleanly restarted (Accelerometer 0x02 active)'
          : 'Restart sent, negotiating stream...'
      );
    } catch (e) {
      setActionFeedback(`Restart error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCommandPending(false);
    }
  };

  const handleStopStream = async () => {
    setIsCommandPending(true);
    setActionFeedback(null);
    try {
      await bluetooth.stopStream();
      setActionFeedback('Measurement stream paused');
    } catch (e) {
      setActionFeedback(`Stop error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCommandPending(false);
    }
  };

  if (!isBleConnected || !deviceInfo) {
    return null;
  }

  const streamType = deviceInfo.activeStreamType;
  const lastResp = deviceInfo.lastPmdResponse || '';
  const isGyroNotSupported =
    lastResp.includes('GYRO') &&
    (lastResp.includes('NOT_SUPPORTED') || lastResp.includes('INVALID_MEASUREMENT_TYPE'));

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Bluetooth className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Polar Hardware BLE Telemetry</h3>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                GATT Linked
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Direct BLE connection to <strong className="text-white">{deviceInfo.name}</strong> ({deviceInfo.id})
            </p>
          </div>
        </div>

        {/* Live Packet Counter */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-500">Packets Pulled:</span>
          <span className="font-bold text-sky-400 tabular-nums">
            {deviceInfo.packetsReceived.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Stream Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 mb-1 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-purple-400" />
            <span>Active Stream</span>
          </div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            {streamType === 'GYRO' ? (
              <span className="text-purple-400">Gyroscope (0x05)</span>
            ) : streamType === 'ACC' ? (
              <span className="text-sky-400">Accelerometer (0x02)</span>
            ) : (
              <span className="text-amber-400">Idle / Awaiting</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {deviceInfo.configuredSampleRate ? `${deviceInfo.configuredSampleRate} Hz · 16-bit · 3 channels` : 'Awaiting stream start'}
          </div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 mb-1 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Wearable Battery</span>
          </div>
          <div className="text-sm font-bold text-white">
            {deviceInfo.batteryLevel !== undefined ? `${deviceInfo.batteryLevel}%` : 'Reading...'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">GATT Battery Service</div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            <span>PMD Handshake</span>
          </div>
          <div className="text-xs font-medium text-slate-300 break-words" title={lastResp}>
            {lastResp || 'Control Point Subscribed (0xFB005C81)'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Polar Measurement Data Protocol</div>
        </div>
      </div>

      {/* Hardware Note when Gyroscope is not supported */}
      {isGyroNotSupported && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block text-amber-300">
              Hardware Sensor Capability Notice
            </span>
            <span className="text-[11px] text-amber-300/80 block leading-relaxed">
              Your Polar device responded with <code className="text-white">NOT_SUPPORTED</code> for Gyroscope (0x05) because the Polar Loop 2 hardware contains an integrated 3-axis accelerometer rather than a gyroscope. The stream has automatically negotiated and activated the 3D Accelerometer (0x02) stream for OpenSeizureDetector analysis.
            </span>
          </div>
        </div>
      )}

      {/* Manual Hardware Control Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleStartAcc}
            disabled={isCommandPending}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${
              streamType === 'ACC'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-900/50'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Negotiate Acc (0x02)</span>
          </button>

          <button
            onClick={handleStartGyro}
            disabled={isCommandPending}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${
              streamType === 'GYRO'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-900/50'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Negotiate Gyro (0x05)</span>
          </button>

          <button
            onClick={handleRestartStream}
            disabled={isCommandPending}
            className="px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 font-semibold text-xs border border-sky-800 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCommandPending ? 'animate-spin' : ''}`} />
            <span>Restart Stream</span>
          </button>

          <button
            onClick={handleStopStream}
            disabled={isCommandPending}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-medium text-xs border border-slate-700 transition-colors"
          >
            Pause Stream
          </button>
        </div>

        {actionFeedback && (
          <span className="text-xs text-amber-300 font-mono flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {actionFeedback}
          </span>
        )}
      </div>

      {/* Discovered Services List (Collapsible / Compact) */}
      {deviceInfo.discoveredServices && deviceInfo.discoveredServices.length > 0 && (
        <details className="text-[11px] font-mono text-slate-400 bg-slate-950/40 rounded-xl p-2.5 border border-slate-800/60">
          <summary className="cursor-pointer text-slate-300 hover:text-white font-semibold flex items-center gap-1.5">
            <span>Discovered GATT Services ({deviceInfo.discoveredServices.length})</span>
          </summary>
          <div className="mt-2 space-y-1 pl-2">
            {deviceInfo.discoveredServices.map((uuid) => {
              const label =
                uuid.includes('180d')
                  ? 'Heart Rate (0x180D)'
                  : uuid.includes('180f')
                  ? 'Battery Service (0x180F)'
                  : uuid.includes('180a')
                  ? 'Device Information (0x180A)'
                  : uuid.includes('fb005c80')
                  ? 'Polar PMD Motion Service (fb005c80)'
                  : uuid.includes('fee7')
                  ? 'Polar Sync Protocol (0xFEE7)'
                  : uuid.includes('fee8')
                  ? 'Polar Firmware Service (0xFEE8)'
                  : uuid;
              return (
                <div key={uuid} className="text-slate-400">
                  • <span className="text-slate-300">{label}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Real-time Stream Debugger & Raw Characters Inspector */}
      <StreamDebugConsole
        deviceInfo={deviceInfo}
        isBleConnected={isBleConnected}
      />
    </div>
  );
};
