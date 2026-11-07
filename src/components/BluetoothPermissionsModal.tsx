/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Copy,
  Check,
  ExternalLink,
  Play,
  Smartphone,
  X,
  Info,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';

interface BluetoothPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryPairing?: (acceptAllDevices?: boolean) => void;
  onStartSimulator: () => void;
  rawErrorMessage?: string;
}

export const BluetoothPermissionsModal: React.FC<BluetoothPermissionsModalProps> = ({
  isOpen,
  onClose,
  onRetryPairing,
  onStartSimulator,
  rawErrorMessage,
}) => {
  const [copied, setCopied] = useState(false);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (!isOpen) return null;

  const isPermissionsPolicy =
    rawErrorMessage?.includes('permissions policy') ||
    rawErrorMessage?.includes('disallowed');

  const isConnectionAttemptFailed =
    rawErrorMessage?.includes('Connection attempt failed') ||
    rawErrorMessage?.includes('Connection Error') ||
    rawErrorMessage?.includes('NetworkError');

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              isConnectionAttemptFailed
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            <Bluetooth className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  isConnectionAttemptFailed
                    ? 'text-rose-400 bg-rose-950/60 border-rose-800/80'
                    : 'text-amber-400 bg-amber-950/60 border-amber-800/80'
                }`}
              >
                {isConnectionAttemptFailed
                  ? 'BLE Handshake Conflict'
                  : 'Permissions Policy'}
              </span>
              <span className="text-xs text-slate-400">Polar BLE Troubleshooting</span>
            </div>
            <h2 className="text-lg font-bold text-white">
              {isConnectionAttemptFailed
                ? 'Polar Loop Connection Conflict / Device Busy'
                : 'Bluetooth Blocked by Embedded Preview Frame'}
            </h2>
          </div>
        </div>

        {/* Cause & Explanation */}
        {isConnectionAttemptFailed ? (
          <div className="space-y-4">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
              <p className="font-semibold text-rose-300">
                Why does it say &quot;Unsupported&quot; or &quot;Connection attempt failed&quot;?
              </p>
              <p className="leading-relaxed text-slate-400">
                The Polar Loop Gen2 uses a Nordic BLE radio that supports <strong className="text-white">only one single active connection at a time</strong>. If another app or the phone&apos;s OS holds the link, Chrome is rejected during the GATT handshake.
              </p>
            </div>

            {/* Step-by-Step Fix Checklist */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Required 3-Step Fix:
              </h3>
              <ol className="text-xs text-slate-300 space-y-2.5 list-decimal list-inside leading-relaxed">
                <li className="pl-1">
                  <strong className="text-white">Unpair from Phone Bluetooth Settings:</strong>
                  <span className="text-slate-400 block ml-4 text-[11px]">
                    Go to Android Settings ➔ Bluetooth / Connected Devices ➔ find <strong className="text-slate-200">Polar Loop</strong> ➔ tap Gear icon ➔ select <strong className="text-amber-300">Unpair / Forget</strong>. (The web app connects directly via Web Bluetooth; OS-level pairing locks the channel).
                  </span>
                </li>
                <li className="pl-1">
                  <strong className="text-white">Force-Close the Polar Flow App:</strong>
                  <span className="text-slate-400 block ml-4 text-[11px]">
                    If the official Polar Flow app is running in the background, swipe it away. It aggressively holds the BLE connection.
                  </span>
                </li>
                <li className="pl-1">
                  <strong className="text-white">Wake Up the Polar Loop:</strong>
                  <span className="text-slate-400 block ml-4 text-[11px]">
                    Tap the capacitive touch button on the Polar Loop until the red LED screen lights up, or plug it into the USB magnetic charger for 2 seconds and unplug. (Sleeping trackers stop advertising).
                  </span>
                </li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    onClose();
                    onRetryPairing?.(false);
                  }}
                  className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Polar Pairing
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onRetryPairing?.(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-700 transition-colors"
                  title="Shows all nearby Bluetooth LE devices without filtering by Polar name prefix"
                >
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  Scan All BLE (Unfiltered)
                </button>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onStartSimulator();
                }}
                className="w-full flex items-center justify-center gap-2 bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md transition-colors"
              >
                <Play className="w-4 h-4" />
                Test Seizure Detection with Polar Simulator
              </button>
            </div>
          </div>
        ) : (
          /* Permissions Policy Explainer (If inside iframe) */
          <div className="space-y-4">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2.5">
              <p className="leading-relaxed">
                Google Chrome and Android security rules <strong className="text-white">disallow Web Bluetooth inside embedded <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">&lt;iframe&gt;</code> previews</strong> to protect local radio devices from unauthorized iframe access.
              </p>
              <p className="leading-relaxed text-slate-400">
                To connect to physical <strong className="text-slate-200">Polar Loop Gen2, Polar H10, or Verity Sense</strong> hardware, the application simply needs to run in a <strong className="text-slate-200">direct standalone tab or installed as an Android PWA</strong>.
              </p>
            </div>

            {/* Action Options */}
            <div className="space-y-3">
              <div className="bg-slate-800/50 hover:bg-slate-800/90 border border-emerald-900/40 rounded-xl p-3.5 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <ExternalLink className="w-4 h-4" />
                    <span>Option 1: Open in Dedicated Tab (Recommended for Pairing)</span>
                  </div>
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                    Full BLE Access
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Opens this exact app outside the iframe. In top-level mode, Chrome immediately grants full Web Bluetooth pairing privileges.
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-emerald-950/40 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Standalone App Now
                  </a>
                  <button
                    onClick={handleCopyUrl}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs py-2.5 px-3 rounded-lg transition-colors"
                    title="Copy standalone URL to open on your Android phone"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span className="font-mono">{copied ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 hover:bg-slate-800/90 border border-rose-900/40 rounded-xl p-3.5 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                    <Play className="w-4 h-4" />
                    <span>Option 2: Test with 25 Hz Polar Sensor Simulator</span>
                  </div>
                  <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-800 px-1.5 py-0.5 rounded font-mono">
                    Works in Preview
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Streams high-fidelity 25 Hz 3D acceleration data matching real Polar Loop sensors, including clonic seizure tremor patterns, FFT analysis, siren, and carer notifications.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onStartSimulator();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-rose-950/40 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Start Polar Simulator Inside Preview
                </button>
              </div>
            </div>

            {/* Mobile PWA Guidance Note */}
            <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
              <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-slate-300">Android Tip:</strong> Open the copied URL in Chrome on your Android mobile, tap <strong className="text-slate-300">&quot;Install app&quot;</strong> or <strong className="text-slate-300">&quot;Add to Home screen&quot;</strong>. Installed PWAs have native Web Bluetooth and wake-lock access with zero permission policy restrictions.
              </p>
            </div>
          </div>
        )}

        {rawErrorMessage && (
          <div className="pt-2 border-t border-slate-800/80 font-mono text-[10px] text-slate-500 truncate" title={rawErrorMessage}>
            System Error: {rawErrorMessage}
          </div>
        )}
      </div>
    </div>
  );
};
