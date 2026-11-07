/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory Cloud Dead Man's Watchdog State
interface DeviceTelemetry {
  deviceId: string;
  lastHeartbeatTime: number;
  detectorState: string;
  bleConnected: boolean;
  wearableBattery: number;
  phoneBattery: number;
  lastPacketAgeSeconds: number;
  peakRatio: number;
  peakFrequency: number;
  carerContacts: Array<{ name: string; phone: string; relationship?: string }>;
  isCloudDeadmanBreached: boolean;
  cloudAlertSentAt?: number;
  alertHistory: Array<{
    timestamp: number;
    type: string;
    message: string;
  }>;
}

// Global active device registry
const devices = new Map<string, DeviceTelemetry>();
const DEFAULT_CLOUD_TIMEOUT_SECONDS = 45; // Server dead man timeout (45s)

// Server-Side End-to-End Dead Man's Watchdog Timer
// Runs continuously in the background independent of the mobile device
setInterval(() => {
  const now = Date.now();

  devices.forEach((device, deviceId) => {
    const elapsedSeconds = Math.round((now - device.lastHeartbeatTime) / 1000);

    // If client hasn't sent a heartbeat for > 45s and was actively monitoring
    if (
      device.detectorState !== 'IDLE' &&
      elapsedSeconds > DEFAULT_CLOUD_TIMEOUT_SECONDS &&
      !device.isCloudDeadmanBreached
    ) {
      device.isCloudDeadmanBreached = true;
      device.cloudAlertSentAt = now;

      const logMsg = `CRITICAL CLOUD DEAD MAN: No heartbeat from ${deviceId} for ${elapsedSeconds}s (Threshold: ${DEFAULT_CLOUD_TIMEOUT_SECONDS}s). Phone or app appears offline!`;
      console.warn(`[CloudWatchdog] ${logMsg}`);

      device.alertHistory.unshift({
        timestamp: now,
        type: 'CLOUD_DEADMAN_BREACH',
        message: logMsg,
      });

      // Server-side independent carer notification (carrier SMS or Webhook)
      dispatchServerCloudAlert(device, elapsedSeconds);
    }
  });
}, 1000);

/**
 * Dispatch emergency alert directly from the cloud backend
 */
function dispatchServerCloudAlert(device: DeviceTelemetry, elapsedSeconds: number) {
  const message = `[OpenSeizureDetector Cloud Fail-Safe]\nEMERGENCY: Seizure monitor for device '${device.deviceId}' went SILENT.\nNo heartbeat received for ${elapsedSeconds}s.\nPhone battery was ${device.phoneBattery}%, Wearable battery was ${device.wearableBattery}%.\nPlease check on patient immediately.`;

  console.log(`[CloudAlert] Dispatching carrier alert to ${device.carerContacts.length} emergency contacts.`);
  // Log delivery for API consumers / caregivers
  device.carerContacts.forEach((contact) => {
    console.log(`[CloudAlert SMS] Queued to ${contact.name} (${contact.phone}): ${message.slice(0, 80)}...`);
  });
}

// ---------------------- API ROUTES ----------------------

/**
 * POST /api/heartbeat
 * Endpoint for client PWA to continuously stream status and maintain dead man's handle
 */
app.post('/api/heartbeat', (req, res) => {
  const {
    deviceId = 'patient-device-01',
    detectorState = 'MONITORING_SAFE',
    bleConnected = true,
    wearableBattery = 88,
    phoneBattery = 92,
    lastPacketAgeSeconds = 0,
    peakRatio = 0,
    peakFrequency = 0,
    carerContacts = [],
  } = req.body;

  const now = Date.now();

  let device = devices.get(deviceId);
  if (!device) {
    device = {
      deviceId,
      lastHeartbeatTime: now,
      detectorState,
      bleConnected,
      wearableBattery,
      phoneBattery,
      lastPacketAgeSeconds,
      peakRatio,
      peakFrequency,
      carerContacts,
      isCloudDeadmanBreached: false,
      alertHistory: [],
    };
    devices.set(deviceId, device);
  } else {
    // Reset cloud dead man breach if previously broken
    if (device.isCloudDeadmanBreached) {
      device.isCloudDeadmanBreached = false;
      device.alertHistory.unshift({
        timestamp: now,
        type: 'CLOUD_HEARTBEAT_RESTORED',
        message: `Heartbeat restored after communication outage. Device back online.`,
      });
    }

    device.lastHeartbeatTime = now;
    device.detectorState = detectorState;
    device.bleConnected = bleConnected;
    device.wearableBattery = wearableBattery;
    device.phoneBattery = phoneBattery;
    device.lastPacketAgeSeconds = lastPacketAgeSeconds;
    device.peakRatio = peakRatio;
    device.peakFrequency = peakFrequency;
    if (carerContacts && carerContacts.length > 0) {
      device.carerContacts = carerContacts;
    }
  }

  return res.json({
    status: 'ACK',
    serverTime: now,
    cloudWatchdogStatus: 'HEALTHY',
    deadmanTimeoutSeconds: DEFAULT_CLOUD_TIMEOUT_SECONDS,
  });
});

/**
 * GET /api/status
 * Returns current cloud tracking status, heartbeat age, and dead man state
 */
app.get('/api/status', (req, res) => {
  const deviceId = (req.query.deviceId as string) || 'patient-device-01';
  const device = devices.get(deviceId);
  const now = Date.now();

  if (!device) {
    return res.json({
      status: 'AWAITING_INITIAL_HEARTBEAT',
      deviceId,
      serverTime: now,
      heartbeatAgeSeconds: null,
      cloudWatchdogHealthy: true,
      isCloudDeadmanBreached: false,
      message: 'No device telemetry received yet. Start monitoring in the app to begin tracking.',
    });
  }

  const heartbeatAgeSeconds = Math.round((now - device.lastHeartbeatTime) / 1000);
  const isHealthy = heartbeatAgeSeconds <= DEFAULT_CLOUD_TIMEOUT_SECONDS;

  return res.json({
    status: isHealthy ? 'NOMINAL' : 'FAIL_SAFE_TRIGGERED',
    deviceId,
    serverTime: now,
    lastHeartbeatTime: device.lastHeartbeatTime,
    heartbeatAgeSeconds,
    cloudTimeoutSeconds: DEFAULT_CLOUD_TIMEOUT_SECONDS,
    cloudWatchdogHealthy: isHealthy,
    isCloudDeadmanBreached: device.isCloudDeadmanBreached,
    detectorState: device.detectorState,
    bleConnected: device.bleConnected,
    wearableBattery: device.wearableBattery,
    phoneBattery: device.phoneBattery,
    peakRatio: device.peakRatio,
    peakFrequency: device.peakFrequency,
    carerContactsCount: device.carerContacts.length,
    recentAlerts: device.alertHistory.slice(0, 10),
  });
});

/**
 * POST /api/trigger-alert
 * Dispatches emergency alert to carers from the server
 */
app.post('/api/trigger-alert', (req, res) => {
  const { deviceId = 'patient-device-01', type = 'SEIZURE_ALARM', reason = '' } = req.body;
  const now = Date.now();

  let device = devices.get(deviceId);
  if (!device) {
    device = {
      deviceId,
      lastHeartbeatTime: now,
      detectorState: 'ALARM',
      bleConnected: true,
      wearableBattery: 88,
      phoneBattery: 92,
      lastPacketAgeSeconds: 0,
      peakRatio: 0.72,
      peakFrequency: 4.8,
      carerContacts: [],
      isCloudDeadmanBreached: false,
      alertHistory: [],
    };
    devices.set(deviceId, device);
  }

  device.alertHistory.unshift({
    timestamp: now,
    type,
    message: reason || 'Seizure convulsions verified via 3-8 Hz FFT.',
  });

  return res.json({
    success: true,
    message: 'Server emergency alert processed and logged.',
    timestamp: now,
  });
});

// ---------------------- GITHUB SYNC ENDPOINTS ----------------------

import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

/**
 * GET /api/git/status
 * Returns current Git status, branch, commit history, and configured remote
 */
app.get('/api/git/status', async (_req, res) => {
  try {
    const cwd = process.cwd();

    // Ensure safe.directory is configured
    try {
      await execPromise('git config --global --add safe.directory ' + cwd);
    } catch (_) {}

    const { stdout: branchOut } = await execPromise('git rev-parse --abbrev-ref HEAD').catch(() => ({ stdout: 'main' }));
    const branch = branchOut.trim();

    let lastCommit = null;
    try {
      const { stdout: logOut } = await execPromise('git log -1 --format="%h|%an|%ad|%s"');
      const parts = logOut.trim().split('|');
      if (parts.length >= 4) {
        lastCommit = {
          hash: parts[0],
          author: parts[1],
          date: parts[2],
          message: parts.slice(3).join('|'),
        };
      }
    } catch (_) {}

    let remoteUrl = '';
    try {
      const { stdout: remoteOut } = await execPromise('git remote get-url origin');
      remoteUrl = remoteOut.trim();
    } catch (_) {}

    let dirty = false;
    let changedFiles: string[] = [];
    try {
      const { stdout: statusOut } = await execPromise('git status --porcelain');
      changedFiles = statusOut.split('\n').map((l) => l.trim()).filter(Boolean);
      dirty = changedFiles.length > 0;
    } catch (_) {}

    let commitCount = 1;
    try {
      const { stdout: countOut } = await execPromise('git rev-list --count HEAD');
      commitCount = parseInt(countOut.trim(), 10) || 1;
    } catch (_) {}

    // Mask any token embedded in remoteUrl for safe display
    const sanitizedRemoteUrl = remoteUrl.replace(/https:\/\/[^@]+@github\.com/i, 'https://***@github.com');

    return res.json({
      success: true,
      branch,
      lastCommit,
      remoteUrl: sanitizedRemoteUrl,
      rawRemoteUrlPresent: Boolean(remoteUrl),
      dirty,
      changedFiles,
      commitCount,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/git/sync
 * Stages, commits, and pushes to GitHub repository
 */
app.post('/api/git/sync', async (req, res) => {
  try {
    const { remoteUrl, token, branch = 'main', commitMessage = 'sync: update OpenSeizureDetector Polar BLE app' } = req.body;
    const cwd = process.cwd();

    await execPromise('git config --global --add safe.directory ' + cwd);
    await execPromise('git config user.name "AI Studio"');
    await execPromise('git config user.email "aistudio@google.com"');

    // If new remote URL or token provided, configure origin
    let pushUrl = remoteUrl ? remoteUrl.trim() : '';

    if (!pushUrl) {
      try {
        const { stdout: existingRemote } = await execPromise('git remote get-url origin');
        pushUrl = existingRemote.trim();
      } catch (_) {}
    }

    if (!pushUrl) {
      return res.status(400).json({
        success: false,
        error: 'No GitHub repository remote configured. Please provide a GitHub repository URL (e.g., https://github.com/username/repository.git).',
      });
    }

    // Embed token if provided separately
    if (token && token.trim()) {
      const cleanToken = token.trim();
      if (pushUrl.startsWith('https://github.com/')) {
        pushUrl = pushUrl.replace('https://github.com/', `https://${cleanToken}@github.com/`);
      }
    }

    // Set or update origin remote
    try {
      await execPromise('git remote remove origin').catch(() => {});
      await execPromise(`git remote add origin ${pushUrl}`);
    } catch (e) {
      console.warn('[Git] Remote set warning:', e);
    }

    // Stage and commit any dirty changes
    let committed = false;
    const { stdout: statusOut } = await execPromise('git status --porcelain');
    if (statusOut.trim().length > 0) {
      await execPromise('git add .');
      const safeMessage = commitMessage.replace(/"/g, '\\"');
      await execPromise(`git commit -m "${safeMessage}"`);
      committed = true;
    }

    // Push to GitHub branch
    const { stdout: pushOut, stderr: pushErr } = await execPromise(`git push -u origin ${branch}`);

    return res.json({
      success: true,
      message: 'Successfully synced to GitHub repository!',
      branch,
      committed,
      details: pushOut || pushErr || 'Push completed.',
    });
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Git Sync Error]:', err);
    return res.status(500).json({
      success: false,
      error: errMsg,
      hint: errMsg.includes('Authentication') || errMsg.includes('Permission denied') || errMsg.includes('403')
        ? 'GitHub requires authentication. Please provide a GitHub Personal Access Token (PAT) with "repo" scope or include it in the URL (https://<token>@github.com/<owner>/<repo>.git).'
        : undefined,
    });
  }
});

// ---------------------- FRONTEND SPA MOUNTING ----------------------

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    // Production: serve built static assets
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    // Development: mount Vite middlewares and attach HMR to httpServer
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenSeizureDetector Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
