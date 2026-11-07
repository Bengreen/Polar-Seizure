/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { BluetoothDeviceInfo, bluetooth, BleStreamEvent } from '../services/bluetooth';
import {
  Terminal,
  Clock,
  Binary,
  Send,
  Eye,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ShieldCheck,
  Zap,
  Radio,
  Download,
  FileCode,
} from 'lucide-react';

interface StreamDebugConsoleProps {
  deviceInfo: BluetoothDeviceInfo | null;
  isBleConnected: boolean;
}

export const StreamDebugConsole: React.FC<StreamDebugConsoleProps> = ({
  deviceInfo,
  isBleConnected,
}) => {
  // Live ticking timer for time since last update (updates every 100ms)
  const [now, setNow] = useState<number>(Date.now());
  const [charViewMode, setCharViewMode] = useState<'hex' | 'ascii' | 'split'>('split');
  const [filterType, setFilterType] = useState<'ALL' | 'DATA' | 'CTRL' | 'ERR'>('ALL');
  const [customHexInput, setCustomHexInput] = useState<string>('02 02 00 01 19 00 01 01 10 00 02 01 08 00');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  if (!isBleConnected || !deviceInfo) {
    return null;
  }

  const debug = deviceInfo.streamDebug;
  const lastPacketTime = debug?.lastPacketTimestamp;
  const elapsedMs = lastPacketTime ? Math.max(0, now - lastPacketTime) : null;
  const elapsedSeconds = elapsedMs !== null ? elapsedMs / 1000.0 : null;

  // Determine stream freshness state
  let streamStateBadge = {
    label: 'Awaiting Stream',
    color: 'bg-slate-800 text-slate-400 border-slate-700',
    pulse: false,
  };
  if (elapsedSeconds !== null) {
    if (elapsedSeconds < 1.0) {
      streamStateBadge = {
        label: `Active Stream (${elapsedSeconds.toFixed(2)}s ago)`,
        color: 'bg-emerald-950/80 text-emerald-400 border-emerald-800',
        pulse: true,
      };
    } else if (elapsedSeconds < 5.0) {
      streamStateBadge = {
        label: `Intermittent (${elapsedSeconds.toFixed(1)}s ago)`,
        color: 'bg-amber-950/80 text-amber-400 border-amber-800',
        pulse: false,
      };
    } else {
      streamStateBadge = {
        label: `Stalled / Idle (${elapsedSeconds.toFixed(1)}s ago)`,
        color: 'bg-rose-950/80 text-rose-400 border-rose-800',
        pulse: false,
      };
    }
  }

  const handleSendCustomHex = async () => {
    if (!customHexInput.trim()) return;
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await bluetooth.sendCustomControlHex(customHexInput);
      setSendResult(`Success: ${res}`);
    } catch (e) {
      setSendResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKickstart = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await bluetooth.kickstartStream();
      setSendResult(`Success: ${res}`);
    } catch (e) {
      setSendResult(`Kickstart error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleDirectRead = async (type: 'DATA' | 'CTRL' | 'BATTERY') => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await bluetooth.readCharacteristicDirectly(type);
      setSendResult(`Read ${res.length}B: ${res.hex}`);
    } catch (e) {
      setSendResult(`Read ${type} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyRecent = () => {
    const textToCopy = `=== Polar Stream Debug Dump ===
Device: ${deviceInfo.name} (${deviceInfo.id})
Active Stream: ${deviceInfo.activeStreamType}
Total Packets: ${debug?.totalPacketsRead}
Total Characters/Bytes Read: ${debug?.totalBytesRead}
Time Since Last Update: ${elapsedSeconds !== null ? `${elapsedSeconds.toFixed(2)}s` : 'None'}
Last Packet Hex: ${debug?.lastPacketHex || 'None'}
Last Packet ASCII: ${debug?.lastPacketAscii || 'None'}
Last Control Hex: ${debug?.lastControlHex || 'None'}
Last PMD Response: ${deviceInfo.lastPmdResponse || 'None'}

Recent Events:
${(debug?.recentEvents || [])
  .map(
    (ev) =>
      `[${new Date(ev.timestamp).toLocaleTimeString()}.${String(ev.timestamp % 1000).padStart(3, '0')}] [${ev.type}] [${ev.source || 'SYS'}] ${ev.message} ${ev.hex ? `| Hex: ${ev.hex}` : ''}`
  )
  .join('\n')}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filteredEvents = (debug?.recentEvents || []).filter((ev) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'DATA') return ev.type === 'DATA';
    if (filterType === 'CTRL') return ev.type === 'CTRL';
    if (filterType === 'ERR') return ev.type === 'ERR' || ev.type === 'WARN';
    return true;
  });

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-xl overflow-hidden font-mono text-xs">
      {/* Header Bar */}
      <div className="p-3.5 sm:p-4 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">BLE Stream Live Debugger</span>
              <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
                Chars &amp; Telemetry
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Live inspection of raw characters read, packet buffers, and timing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stream Freshness Badge */}
          <div
            className={`px-3 py-1 rounded-lg border font-semibold flex items-center gap-2 text-xs ${streamStateBadge.color}`}
          >
            {streamStateBadge.pulse ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-current opacity-70" />
            )}
            <span>{streamStateBadge.label}</span>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isCollapsed ? 'Expand Debugger' : 'Collapse Debugger'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-4">
          {/* Quick Stream Kickstart & Control Bar */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={async () => {
                  setIsSending(true);
                  setSendResult(null);
                  try {
                    const res = await bluetooth.unlock25HzStream();
                    setSendResult(res);
                  } catch (e) {
                    setSendResult(`Unlock error: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setIsSending(false);
                  }
                }}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/50 transition-all active:scale-95"
                title="Attempts to transition Polar Loop 2 into continuous 25Hz streaming via SDK Mode [02 09] and Range-First TLV negotiation"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span>Unlock 25Hz Stream</span>
              </button>

              <button
                onClick={handleKickstart}
                disabled={isSending}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 ${
                  elapsedSeconds === null || elapsedSeconds > 3.0
                    ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-amber-600/30'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20'
                }`}
                title="Send minimal Start command [02 02] or Stop+Start to kickstart streaming immediately"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kickstart [02 02]</span>
              </button>

              <button
                onClick={() => {
                  setCustomHexInput('02 02 02 01 08 00 00 01 19 00 01 01 10 00');
                  bluetooth.sendCustomControlHex('02 02 02 01 08 00 00 01 19 00 01 01 10 00');
                }}
                disabled={isSending}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-[11px] font-medium border border-teal-800/60"
                title="Range-First ACC 25Hz 16-bit 8G"
              >
                Range-First 25Hz
              </button>

              <button
                onClick={() => {
                  setCustomHexInput('02 02 00 01 19 00 01 01 08 00 02 01 08 00');
                  bluetooth.sendCustomControlHex('02 02 00 01 19 00 01 01 08 00 02 01 08 00');
                }}
                disabled={isSending}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
                title="Start ACC in native 8-bit frame format (25Hz 8G)"
              >
                Start 8-bit ACC
              </button>

              <button
                onClick={() => handleDirectRead('DATA')}
                disabled={isSending}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-[11px] font-medium border border-slate-700"
                title="Direct readValue() on PMD Data characteristic"
              >
                Direct readValue(Data)
              </button>

              <button
                onClick={() => bluetooth.stopStream()}
                disabled={isSending}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-[11px] font-medium border border-slate-700"
                title="Send STOP measurement command [03 02]"
              >
                Stop [03 02]
              </button>
            </div>

            {sendResult && (
              <span className="text-[11px] text-amber-300 truncate max-w-xs font-mono">
                {sendResult}
              </span>
            )}
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* 1. Action Samples Captured Counter */}
            <div className="bg-slate-950 p-3 rounded-xl border border-sky-800/80 bg-gradient-to-b from-sky-950/20 to-slate-950">
              <div className="text-[11px] text-slate-400 flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Action Samples</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-sm sm:text-base font-bold tabular-nums text-emerald-400">
                {(debug?.currentAction?.samplesCaptured ?? 0).toLocaleString()}
                <span className="text-xs text-slate-400 font-normal ml-1">samples</span>
              </div>
              <div className="text-[10px] text-sky-200 truncate mt-1 font-medium" title={debug?.currentAction?.actionName || 'Active Stream'}>
                {debug?.currentAction?.actionName || 'Active Stream'}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                {debug?.currentAction?.packetsReceived ?? 0} pkts ({debug?.lastPacketSamplesCount ?? 1} / pkt)
              </div>
            </div>

            {/* 2. Time Since Last Update */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Time Since Update</span>
              </div>
              <div className="text-sm sm:text-base font-bold tabular-nums text-white flex items-baseline gap-1">
                {elapsedSeconds !== null ? (
                  <>
                    <span
                      className={
                        elapsedSeconds < 1.0
                          ? 'text-emerald-400'
                          : elapsedSeconds < 5.0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {elapsedSeconds.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-500 font-normal">sec ago</span>
                  </>
                ) : (
                  <span className="text-slate-500 text-xs">No packet yet</span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {lastPacketTime
                  ? new Date(lastPacketTime).toLocaleTimeString()
                  : 'Awaiting first frame'}
              </div>
            </div>

            {/* 2. Total Characters / Bytes Read */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                <Binary className="w-3.5 h-3.5 text-sky-400" />
                <span>Characters Read</span>
              </div>
              <div className="text-sm sm:text-base font-bold tabular-nums text-sky-400">
                {(debug?.totalBytesRead ?? 0).toLocaleString()}
                <span className="text-xs text-slate-500 font-normal ml-1">bytes</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {debug?.totalPacketsRead ?? 0} packets processed
              </div>
            </div>

            {/* 3. Last Packet Length */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                <span>Last Packet Size</span>
              </div>
              <div className="text-sm sm:text-base font-bold tabular-nums text-purple-400">
                {debug?.lastPacketByteLength ?? 0}
                <span className="text-xs text-slate-500 font-normal ml-1">bytes</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {deviceInfo.configuredSampleRate ?? 25} Hz stream rate
              </div>
            </div>

            {/* 4. PMD Notification Status */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>GATT Subscriptions</span>
              </div>
              <div className="text-xs font-semibold text-white space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Data (FB005C82):</span>
                  <span
                    className={
                      debug?.dataNotificationActive
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400'
                    }
                  >
                    {debug?.dataNotificationActive ? 'Subscribed' : 'Idle'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Control (5C81):</span>
                  <span
                    className={
                      debug?.controlNotificationActive
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-400'
                    }
                  >
                    {debug?.controlNotificationActive ? 'Subscribed' : 'Idle'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Raw Characters & Hex Inspection Viewport */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-bold">Latest Packet Content</span>
                <span className="text-[10px] text-slate-500">
                  ({debug?.lastPacketByteLength ?? 0} characters/bytes)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="bg-slate-900 rounded-lg p-0.5 border border-slate-800 flex text-[10px]">
                  <button
                    onClick={() => setCharViewMode('split')}
                    className={`px-2 py-0.5 rounded ${
                      charViewMode === 'split' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    Split Hex/ASCII
                  </button>
                  <button
                    onClick={() => setCharViewMode('hex')}
                    className={`px-2 py-0.5 rounded ${
                      charViewMode === 'hex' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    Hex Only
                  </button>
                  <button
                    onClick={() => setCharViewMode('ascii')}
                    className={`px-2 py-0.5 rounded ${
                      charViewMode === 'ascii' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    ASCII Only
                  </button>
                </div>

                <button
                  onClick={handleCopyRecent}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-colors"
                  title="Copy Dump to Clipboard"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Characters / Hex Display Box */}
            <div className="bg-slate-900/90 rounded-lg p-2.5 text-[11px] leading-relaxed overflow-x-auto select-all">
              {debug?.lastPacketHex ? (
                charViewMode === 'split' ? (
                  <div className="space-y-1">
                    <div className="flex items-start gap-3">
                      <span className="text-slate-500 w-12 shrink-0">HEX:</span>
                      <span className="text-emerald-400 break-all font-mono font-medium">
                        {debug.lastPacketHex}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-slate-500 w-12 shrink-0">ASCII:</span>
                      <span className="text-amber-300 break-all font-mono">
                        {debug.lastPacketAscii || '(non-printable characters)'}
                      </span>
                    </div>
                  </div>
                ) : charViewMode === 'hex' ? (
                  <div className="text-emerald-400 break-all">{debug.lastPacketHex}</div>
                ) : (
                  <div className="text-amber-300 break-all">
                    {debug.lastPacketAscii || '(non-printable characters)'}
                  </div>
                )
              ) : (
                <div className="text-slate-500 italic py-2 text-center">
                  No motion packets received yet. Tap &ldquo;Force Start ACC&rdquo; below or check GATT link.
                </div>
              )}
            </div>

            {/* Last Control Response */}
            {deviceInfo.lastPmdResponse && (
              <div className="text-[11px] flex flex-wrap items-center gap-2 pt-1 text-slate-400">
                <span className="text-slate-500">Last Handshake:</span>
                <code className="text-sky-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {deviceInfo.lastPmdResponse}
                </code>
                {debug?.lastControlHex && (
                  <code className="text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-[10px]">
                    Hex: {debug.lastControlHex}
                  </code>
                )}
              </div>
            )}
          </div>

          {/* Direct Interactive Control & Hex Command Sender */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2.5">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Direct PMD Command &amp; Read Console</span>
              <span className="text-[10px] text-slate-500">Write to FB005C81 / Read FB005C82</span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleKickstart}
                disabled={isSending}
                className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold border border-emerald-700/80 text-[10px] flex items-center gap-1 shadow-sm"
                title="Clears ERROR_ALREADY_IN_STATE: sends STOP [03 02], waits 350ms, then starts ACC stream"
              >
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>Auto Clear &amp; Start [Stop 03 02 &rarr; Start]</span>
              </button>
              <button
                onClick={() => setCustomHexInput('02 02 02 01 08 00 00 01 19 00 01 01 10 00')}
                className="px-2 py-1 rounded bg-teal-950/80 hover:bg-teal-900 text-teal-300 border border-teal-700/60 text-[10px]"
                title="Range-First ACC 25Hz 16-bit 8G"
              >
                Preset: Range-First 25Hz 8G
              </button>
              <button
                onClick={() => setCustomHexInput('02 02 02 01 02 00 00 01 19 00 01 01 10 00')}
                className="px-2 py-1 rounded bg-teal-950/80 hover:bg-teal-900 text-teal-300 border border-teal-700/60 text-[10px]"
                title="Range-First ACC 25Hz 16-bit 2G"
              >
                Preset: Range-First 25Hz 2G
              </button>
              <button
                onClick={() => setCustomHexInput('02 09')}
                className="px-2 py-1 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/60 text-[10px]"
                title="Start SDK Mode [02 09]"
              >
                Preset: SDK Mode [02 09]
              </button>
              <button
                onClick={() => setCustomHexInput('02 02 00 01 19 00 01 01 10 00 02 01 08 00')}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-900/60 text-[10px]"
              >
                Preset: Rate-First 25Hz 8G
              </button>
              <button
                onClick={() => setCustomHexInput('02 02 00 01 34 00 01 01 10 00 02 01 08 00')}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-900/60 text-[10px]"
              >
                Preset: ACC 52Hz
              </button>
              <button
                onClick={() => setCustomHexInput('02 02')}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-900/60 text-[10px]"
              >
                Preset: Minimal [02 02]
              </button>
              <button
                onClick={() => {
                  setCustomHexInput('03 02');
                  bluetooth.sendStopCommandAndWait(0x02, 800);
                }}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-rose-400 border border-rose-900/60 text-[10px]"
              >
                Preset: Stop ACC [03 02]
              </button>
              <button
                onClick={() => setCustomHexInput('01 02')}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-purple-400 border border-purple-900/60 text-[10px]"
              >
                Preset: Query Settings [01 02]
              </button>
              <button
                onClick={() => handleDirectRead('DATA')}
                disabled={isSending}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-900/60 text-[10px] flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>Direct readValue(Data)</span>
              </button>
            </div>

            {/* Custom Input Bar */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customHexInput}
                onChange={(e) => setCustomHexInput(e.target.value)}
                placeholder="Hex bytes e.g. 02 02 00 01 19 00 01 01 10 00 02 01 08 00"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleSendCustomHex}
                disabled={isSending}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending...' : 'Send Hex'}</span>
              </button>
            </div>

            {sendResult && (
              <div
                className={`text-[11px] p-2 rounded-lg border ${
                  sendResult.startsWith('Error')
                    ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                }`}
              >
                {sendResult}
              </div>
            )}
          </div>

          {/* Action & Stream Execution History */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Action &amp; Stream Sample Audit</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  {(debug?.actionHistory?.length ?? 0) + (debug?.currentAction ? 1 : 0)} actions recorded
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Session Total: <span className="text-sky-300 font-bold">{(debug?.totalSamplesCaptured ?? 0).toLocaleString()} samples</span>
              </div>
            </div>

            {/* Current Active Action Pill */}
            {debug?.currentAction && (
              <div className="bg-sky-950/40 border border-sky-800/80 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-slate-400">Active Action:</span>
                  <span className="text-white font-bold">{debug.currentAction.actionName}</span>
                  {debug.currentAction.commandHex && (
                    <code className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                      {debug.currentAction.commandHex}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-emerald-400 font-bold text-xs">
                    {debug.currentAction.samplesCaptured.toLocaleString()} samples captured
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    ({debug.currentAction.packetsReceived} pkts, {debug.lastPacketSamplesCount || 1} smp/pkt)
                  </span>
                </div>
              </div>
            )}

            {/* Completed Actions Table */}
            {debug?.actionHistory && debug.actionHistory.length > 0 ? (
              <div className="max-h-44 overflow-y-auto space-y-1 font-mono text-[11px]">
                {debug.actionHistory.map((act, idx) => (
                  <div
                    key={`act-hist-${act.id}-${idx}`}
                    className="p-2 rounded bg-slate-900/80 border border-slate-800/60 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                          act.status === 'COMPLETED'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                            : act.status === 'FAILED'
                            ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                            : 'bg-sky-950/80 text-sky-400 border-sky-800'
                        }`}
                      >
                        {act.status}
                      </span>
                      <span className="text-white font-medium">{act.actionName}</span>
                      {act.commandHex && (
                        <span className="text-[10px] text-slate-500 font-mono">[{act.commandHex}]</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-slate-300">
                      <span className="text-emerald-400 font-bold">
                        {act.samplesCaptured} samples
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {act.packetsReceived} pkts ({act.durationSeconds ? `${act.durationSeconds.toFixed(1)}s` : ''})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !debug?.currentAction && (
                <div className="text-slate-500 italic py-2 text-center text-xs">
                  No stream actions initiated yet. Tap &ldquo;Kickstart [02 02]&rdquo; or &ldquo;Unlock 25Hz Stream&rdquo; above.
                </div>
              )
            )}
          </div>

          {/* Raw Packet Capture & Diagnostics Download Bar */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Binary className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Raw BLE Packet Capture &amp; Diagnostics</span>
                <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-mono">
                  {debug?.rawPacketHistory?.length || 0} packets recorded
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => bluetooth.downloadRawPacketsJson()}
                  disabled={!debug?.rawPacketHistory?.length}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-[11px] shadow transition-colors"
                  title="Download complete raw packet log with timing, hex dump, and GATT info as JSON"
                >
                  <Download className="w-3 h-3" />
                  <span>Download JSON</span>
                </button>
                <button
                  onClick={() => bluetooth.downloadRawPacketsCsv()}
                  disabled={!debug?.rawPacketHistory?.length}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-[11px] shadow transition-colors"
                  title="Download raw packet trace with per-byte columns as CSV"
                >
                  <Download className="w-3 h-3" />
                  <span>Download CSV</span>
                </button>
                <button
                  onClick={() => bluetooth.downloadRawBinaryStream()}
                  disabled={!debug?.rawPacketHistory?.length}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium text-[11px] shadow transition-colors"
                  title="Download raw binary byte stream (.bin)"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .BIN</span>
                </button>
                <button
                  onClick={() => {
                    bluetooth.copyRawPacketsHex();
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  disabled={!debug?.rawPacketHistory?.length}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-medium text-[11px] border border-slate-700 transition-colors"
                  title="Copy raw packet hex dump to clipboard"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied!' : 'Copy Hex'}</span>
                </button>
                <button
                  onClick={() => bluetooth.clearRawPackets()}
                  disabled={!debug?.rawPacketHistory?.length}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-40 text-slate-400 hover:text-white transition-colors"
                  title="Clear Captured Raw Packets"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Explanatory note */}
            <p className="text-[11px] text-slate-400 leading-normal">
              Every raw byte received from Polar GATT characteristics (Data <code className="text-emerald-400">FB005C82</code> and Control <code className="text-purple-400">FB005C81</code>) is preserved bit-for-bit with exact millisecond timestamps. Download the raw JSON or CSV to inspect and debug the packet structure.
            </p>

            {/* Quick Recent Raw Packets Preview */}
            {debug?.rawPacketHistory && debug.rawPacketHistory.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px] bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                {debug.rawPacketHistory.slice(-5).reverse().map((pkt, idx) => (
                  <div key={`raw-pkt-${pkt.characteristic}-${pkt.id}-${idx}-${pkt.timestamp}`} className="flex items-center justify-between gap-2 text-slate-300 border-b border-slate-800/50 pb-1">
                    <span className="text-slate-500 shrink-0">#{pkt.id} ({pkt.byteLength}B{pkt.intervalDeltaMs !== null ? `, \u0394t=${pkt.intervalDeltaMs}ms` : ''})</span>
                    <span className="text-emerald-300 font-bold truncate flex-1 text-right">{pkt.hex}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rolling Stream Event Log */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Live Stream Event Log</span>
                <span className="text-[10px] text-slate-500">
                  ({filteredEvents.length} events)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter chips */}
                <div className="flex gap-1 text-[10px]">
                  {(['ALL', 'DATA', 'CTRL', 'ERR'] as const).map((ft) => (
                    <button
                      key={ft}
                      onClick={() => setFilterType(ft)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        filterType === ft
                          ? 'bg-sky-600 text-white font-bold'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {ft}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => bluetooth.clearStreamDebugLogs()}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Clear Log"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Event list */}
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((ev, idx) => {
                  const timeStr = `${new Date(ev.timestamp).toLocaleTimeString()}.${String(
                    ev.timestamp % 1000
                  ).padStart(3, '0')}`;
                  const badgeColor =
                    ev.type === 'DATA'
                      ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                      : ev.type === 'CTRL'
                      ? 'text-purple-400 bg-purple-950/60 border-purple-800/60'
                      : ev.type === 'WARN'
                      ? 'text-amber-400 bg-amber-950/60 border-amber-800/60'
                      : ev.type === 'ERR'
                      ? 'text-rose-400 bg-rose-950/60 border-rose-800/60'
                      : 'text-sky-400 bg-sky-950/60 border-sky-800/60';

                  return (
                    <div
                      key={`stream-ev-${ev.id}-${idx}`}
                      className="p-1.5 rounded bg-slate-900/80 border border-slate-800/60 flex items-start gap-2 hover:bg-slate-900"
                    >
                      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                        {timeStr}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded border font-bold shrink-0 ${badgeColor}`}
                      >
                        {ev.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-300 break-words">{ev.message}</span>
                        {ev.hex && (
                          <div className="text-[10px] text-slate-500 font-mono break-all mt-0.5">
                            Hex: {ev.hex}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic py-4 text-center text-xs">
                  No events logged matching filter &ldquo;{filterType}&rdquo;.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
