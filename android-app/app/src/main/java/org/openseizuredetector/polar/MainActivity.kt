package org.openseizuredetector.polar

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import org.openseizuredetector.polar.incident.DailyArchiveFileInfo
import org.openseizuredetector.polar.incident.DailyTelemetryLogger
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import org.openseizuredetector.polar.ble.DiagnosticLogEntry
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.DiscoveredDevice
import org.openseizuredetector.polar.ble.LiveBleDiagnostics
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.model.SeizureAlarmState
import org.openseizuredetector.polar.service.PolarForegroundService

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                MainScreen(
                    onStartService = { startMonitoringService() },
                    onStopService = { stopMonitoringService() },
                    onConnectDevice = { deviceId -> connectDevice(deviceId) },
                    onDisconnectDevice = { deviceId -> disconnectDevice(deviceId) },
                    onTriggerScan = { triggerScan() }
                )
            }
        }
    }

    private fun startMonitoringService() {
        try {
            val intent = Intent(this, PolarForegroundService::class.java).apply {
                action = PolarForegroundService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to start service: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }

    private fun stopMonitoringService() {
        val intent = Intent(this, PolarForegroundService::class.java).apply {
            action = PolarForegroundService.ACTION_STOP
        }
        startService(intent)
    }

    private fun connectDevice(deviceId: String) {
        val intent = Intent(this, PolarForegroundService::class.java).apply {
            action = PolarForegroundService.ACTION_CONNECT_DEVICE
            putExtra(PolarForegroundService.EXTRA_DEVICE_ID, deviceId)
        }
        startService(intent)
    }

    private fun disconnectDevice(deviceId: String) {
        val intent = Intent(this, PolarForegroundService::class.java).apply {
            action = PolarForegroundService.ACTION_DISCONNECT_DEVICE
            putExtra(PolarForegroundService.EXTRA_DEVICE_ID, deviceId)
        }
        startService(intent)
    }

    private fun triggerScan() {
        val intent = Intent(this, PolarForegroundService::class.java).apply {
            action = PolarForegroundService.ACTION_START_SCAN
        }
        startService(intent)
    }
}

@Composable
fun MainScreen(
    onStartService: () -> Unit,
    onStopService: () -> Unit,
    onConnectDevice: (String) -> Unit,
    onDisconnectDevice: (String) -> Unit,
    onTriggerScan: () -> Unit
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    val discoveredDevices by DiagnosticManager.discoveredDevices.collectAsState()
    val telemetry by DiagnosticManager.telemetry.collectAsState()
    val isMonitoring = telemetry.isServiceRunning
    val logs by DiagnosticManager.logs.collectAsState()

    val requiredPermissions = remember {
        val list = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            list.add(Manifest.permission.BLUETOOTH_SCAN)
            list.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        list
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissionsMap ->
        val allGranted = permissionsMap.values.all { it }
        if (allGranted) {
            onStartService()
        } else {
            Toast.makeText(
                context,
                "Bluetooth and Notification permissions are required to start seizure monitoring.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    fun checkAndStartService() {
        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            onStartService()
        } else {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    // Default to started on app launch if permissions already granted
    LaunchedEffect(Unit) {
        if (!isMonitoring) {
            val missing = requiredPermissions.filter {
                ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isEmpty()) {
                onStartService()
            }
        }
    }

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Polar-Seizure Monitor",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Build: sha-${BuildConfig.GIT_SHA}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                        fontFamily = FontFamily.Monospace
                    )
                }

                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(
                            color = when (telemetry.connectionState) {
                                "CONNECTED" -> Color(0xFF4CAF50)
                                "CONNECTING" -> Color(0xFFFFEB3B)
                                else -> Color(0xFF9E9E9E)
                            },
                            shape = CircleShape
                        )
                )
            }

            // Top Tab Navigation
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Dashboard") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Devices (${discoveredDevices.size})") }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("Diagnostics & Logs") }
                )
            }

            when (selectedTab) {
                0 -> DashboardView(
                    telemetry = telemetry
                )
                1 -> DevicesView(
                    isMonitoring = isMonitoring,
                    devices = discoveredDevices,
                    connectedDeviceId = telemetry.connectedDeviceId,
                    onStart = { checkAndStartService() },
                    onStop = { onStopService() },
                    onConnect = onConnectDevice,
                    onDisconnect = onDisconnectDevice,
                    onTriggerScan = onTriggerScan
                )
                2 -> DiagnosticsView(
                    telemetry = telemetry,
                    logs = logs,
                    onCopyLogs = {
                        val text = logs.joinToString("\n") { "[${it.timestamp}] [${it.level}] ${it.message}" }
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Polar-Seizure Diagnostics", text))
                        Toast.makeText(context, "Copied ${logs.size} log entries to clipboard", Toast.LENGTH_SHORT).show()
                    },
                    onClearLogs = { DiagnosticManager.clearLogs() }
                )
            }
        }
    }
}

@Composable
fun DashboardView(
    telemetry: LiveBleDiagnostics
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Compact Status Strip: shows Connection status, Battery, and Stream state without bloated device info
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = when {
                    telemetry.energyRatioPercent >= 50.0 -> Color(0xFFFFCDD2) // Alert
                    telemetry.seizurePower3to8Hz > 0.05 -> Color(0xFFFFF9C4) // Warning
                    telemetry.connectionState == "CONNECTED" -> Color(0xFFE8F5E9) // OK
                    else -> Color(0xFFECEFF1)
                }
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(
                                color = when (telemetry.connectionState) {
                                    "CONNECTED" -> Color(0xFF388E3C)
                                    "CONNECTING" -> Color(0xFFF57C00)
                                    else -> Color.Gray
                                },
                                shape = CircleShape
                            )
                    )
                    Text(
                        text = telemetry.connectionState,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
                    if (telemetry.batteryLevel != null) {
                        Text(
                            text = "• ${telemetry.batteryLevel}%",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                Text(
                    text = when {
                        telemetry.isIncidentRecording -> "INCIDENT STREAM"
                        telemetry.isStreamingHr -> "HR DUTY ACTIVE"
                        telemetry.isPpgDutyCycleActive -> "HR DUTY SLEEP"
                        telemetry.isStreamingAcc -> "ACC ACTIVE"
                        else -> "IDLE"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (telemetry.isIncidentRecording) Color(0xFFD32F2F) else Color(0xFF1976D2)
                )
            }
        }

        // Live DSP Energy Card
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(text = "Spectral Energy (3–8 Hz Seizure Band)", style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(6.dp))

                val ratioProgress = (telemetry.energyRatioPercent / 100.0).toFloat().coerceIn(0f, 1f)
                LinearProgressIndicator(
                    progress = { ratioProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp),
                    color = if (telemetry.energyRatioPercent >= 50.0) Color.Red else Color(0xFF4CAF50),
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Ratio: %.1f%% / 50%% threshold".format(telemetry.energyRatioPercent),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = if (telemetry.isStillnessGated) "Resting (Gated)" else "FFT Active",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (telemetry.isStillnessGated) Color.Gray else Color(0xFF1976D2),
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // Accel preview & Live Waveform (30-Second Rolling Window)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Live Accelerometer & Energy", style = MaterialTheme.typography.titleSmall)
                    Text(text = "30s Window", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
                Spacer(modifier = Modifier.height(6.dp))

                // XYZ Text metrics
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "X: %+.2fg".format(telemetry.lastAccX), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Color(0xFFE53935))
                    Text(text = "Y: %+.2fg".format(telemetry.lastAccY), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Color(0xFF43A047))
                    Text(text = "Z: %+.2fg".format(telemetry.lastAccZ), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Color(0xFF1E88E5))
                    Text(text = "|a|: %.2fg".format(telemetry.lastMagnitude), fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Real-time Canvas Graph for XYZ & Energy
                val history = telemetry.accelHistory
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(130.dp)
                        .background(Color(0xFF1E1E1E), shape = RoundedCornerShape(8.dp))
                        .padding(8.dp)
                ) {
                    if (history.size > 2) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val w = size.width
                            val h = size.height
                            val midY = h / 2f
                            // Fixed 300 points scale (30 seconds) so the chart scrolls smoothly across the full width
                            val maxPoints = 300
                            val stepX = w / (maxPoints - 1).toFloat()
                            val startOffsetIndex = (maxPoints - history.size).coerceAtLeast(0)

                            // 10-second grid lines
                            val grid10s = w * (10f / 30f)
                            val grid20s = w * (20f / 30f)
                            drawLine(color = Color(0xFF2C2C2C), start = Offset(grid10s, 0f), end = Offset(grid10s, h), strokeWidth = 1f)
                            drawLine(color = Color(0xFF2C2C2C), start = Offset(grid20s, 0f), end = Offset(grid20s, h), strokeWidth = 1f)

                            // Center baseline (0g)
                            drawLine(
                                color = Color(0xFF424242),
                                start = Offset(0f, midY),
                                end = Offset(w, midY),
                                strokeWidth = 1f
                            )

                            // Threshold line for seizure energy (50%)
                            val threshY = h * (1f - 0.50f)
                            drawLine(
                                color = Color(0x66FF5252),
                                start = Offset(0f, threshY),
                                end = Offset(w, threshY),
                                strokeWidth = 1f
                            )

                            // 30-second temporal alignment matching HR chart
                            val now = System.currentTimeMillis()
                            val windowDurationMs = 30_000L

                            // Filter points within the last 30 seconds
                            val visiblePoints = history.filter { (now - it.timestamp) in 0..windowDurationMs }

                            val pathX = Path()
                            val pathY = Path()
                            val pathZ = Path()
                            val pathEnergy = Path()

                            fun scaleAcc(v: Float): Float = (midY - (v * (midY / 2.5f))).coerceIn(0f, h)
                            fun scaleEnergy(ratioPct: Float): Float = (h - ((ratioPct / 100f) * h)).coerceIn(0f, h)

                            visiblePoints.forEachIndexed { i, pt ->
                                val timeAgoMs = (now - pt.timestamp).coerceAtLeast(0L)
                                val xPos = (w - (timeAgoMs.toFloat() / windowDurationMs.toFloat()) * w).coerceIn(0f, w)

                                val prevPt = visiblePoints.getOrNull(i - 1)
                                // Only break lines if there is a genuine multi-second telemetry drop (> 2000ms),
                                // not normal inter-packet jitter or minor delay.
                                val isGap = prevPt != null && (pt.timestamp - prevPt.timestamp) > 2000L

                                if (i == 0 || isGap) {
                                    pathX.moveTo(xPos, scaleAcc(pt.x))
                                    pathY.moveTo(xPos, scaleAcc(pt.y))
                                    pathZ.moveTo(xPos, scaleAcc(pt.z))
                                    pathEnergy.moveTo(xPos, scaleEnergy(pt.energyRatio))
                                } else {
                                    pathX.lineTo(xPos, scaleAcc(pt.x))
                                    pathY.lineTo(xPos, scaleAcc(pt.y))
                                    pathZ.lineTo(xPos, scaleAcc(pt.z))
                                    pathEnergy.lineTo(xPos, scaleEnergy(pt.energyRatio))
                                }
                            }

                            drawPath(pathX, color = Color(0xFFE53935), style = Stroke(width = 1.8f))
                            drawPath(pathY, color = Color(0xFF43A047), style = Stroke(width = 1.8f))
                            drawPath(pathZ, color = Color(0xFF1E88E5), style = Stroke(width = 1.8f))
                            drawPath(pathEnergy, color = Color(0xFFFFD54F), style = Stroke(width = 2.5f))
                        }
                    } else {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = if (telemetry.isStreamingAcc) "Collecting waveform samples..." else "Connect sensor to stream waveform",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.Gray
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(text = "● X", color = Color(0xFFE53935), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(text = "● Y", color = Color(0xFF43A047), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(text = "● Z", color = Color(0xFF1E88E5), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(text = "● 3-8Hz Energy", color = Color(0xFFFFD54F), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        text = "-30s ⟵ Now",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }
        }

        // Live Heart Rate Waveform (Synchronized 30-Second Rolling Window)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Live Heart Rate (BPM)", style = MaterialTheme.typography.titleSmall)
                    Text(
                        text = if (telemetry.heartRateBpm != null) "${telemetry.heartRateBpm} BPM" else "No Data",
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFFE91E63),
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))

                // Real-time Canvas Graph for HR
                val hrHistory = telemetry.hrHistory
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp)
                        .background(Color(0xFF1E1E1E), shape = RoundedCornerShape(8.dp))
                        .padding(8.dp)
                ) {
                    if (hrHistory.size >= 2) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val w = size.width
                            val h = size.height

                            // Grid lines matching the 30-second window
                            val grid10s = w * (10f / 30f)
                            val grid20s = w * (20f / 30f)
                            drawLine(color = Color(0xFF2C2C2C), start = Offset(grid10s, 0f), end = Offset(grid10s, h), strokeWidth = 1f)
                            drawLine(color = Color(0xFF2C2C2C), start = Offset(grid20s, 0f), end = Offset(grid20s, h), strokeWidth = 1f)

                            // Normal resting HR reference lines: 60 BPM and 100 BPM
                            // Dynamic scale between min(40, lowest) and max(140, highest)
                            val minBpm = (hrHistory.minOf { it.bpm } - 10).coerceAtMost(50).toFloat()
                            val maxBpm = (hrHistory.maxOf { it.bpm } + 10).coerceAtLeast(120).toFloat()
                            val bpmRange = (maxBpm - minBpm).coerceAtLeast(20f)

                            fun scaleBpm(bpm: Int): Float =
                                (h - ((bpm - minBpm) / bpmRange) * h).coerceIn(0f, h)

                            // Reference horizontal line for 100 BPM (tachycardia threshold)
                            if (100f in minBpm..maxBpm) {
                                val y100 = scaleBpm(100)
                                drawLine(
                                    color = Color(0xFF553333),
                                    start = Offset(0f, y100),
                                    end = Offset(w, y100),
                                    strokeWidth = 1f,
                                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
                                )
                            }

                            // 30-second aligned time window
                            val now = System.currentTimeMillis()
                            val windowDurationMs = 30_000L

                            // Only render points within the last 30 seconds
                            val visibleHrPoints = hrHistory.filter { (now - it.timestamp) in 0..windowDurationMs }

                            val pathHr = Path()
                            visibleHrPoints.forEachIndexed { i, pt ->
                                val timeAgoMs = (now - pt.timestamp).coerceAtLeast(0L)
                                val xPos = (w - (timeAgoMs.toFloat() / windowDurationMs.toFloat()) * w).coerceIn(0f, w)
                                val yPos = scaleBpm(pt.bpm)

                                val prevPt = visibleHrPoints.getOrNull(i - 1)
                                // If gap between HR samples exceeds 3.5s (e.g. duty cycle sleep interval), break line
                                val isGap = prevPt != null && (pt.timestamp - prevPt.timestamp) > 3500L

                                if (i == 0 || isGap) {
                                    pathHr.moveTo(xPos, yPos)
                                } else {
                                    pathHr.lineTo(xPos, yPos)
                                }
                            }

                            drawPath(pathHr, color = Color(0xFFE91E63), style = Stroke(width = 2.5f))

                            // Draw dots for isolated points or pulse endpoints so disconnected samples remain clearly visible
                            visibleHrPoints.forEach { pt ->
                                val timeAgoMs = (now - pt.timestamp).coerceAtLeast(0L)
                                val x = (w - (timeAgoMs.toFloat() / windowDurationMs.toFloat()) * w).coerceIn(0f, w)
                                val y = scaleBpm(pt.bpm)
                                drawCircle(color = Color(0xFFFF4081), radius = 3.5f, center = Offset(x, y))
                            }
                        }
                    } else {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                text = if (telemetry.isStreamingHr) "Collecting HR samples..." else "Wear sensor to stream heart rate",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.Gray
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "♥ Heart Rate (BPM)", color = Color(0xFFE91E63), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(
                        text = "-30s ⟵ Now",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

@Composable
fun DevicesView(
    isMonitoring: Boolean,
    devices: List<DiscoveredDevice>,
    connectedDeviceId: String?,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onConnect: (String) -> Unit,
    onDisconnect: (String) -> Unit,
    onTriggerScan: () -> Unit
) {
    var manualDeviceId by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Foreground Service Controls Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "Monitoring Service State",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (isMonitoring) "Service is ACTIVE (Auto-starts on boot)" else "Service is STOPPED",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isMonitoring) Color(0xFF388E3C) else Color.Gray,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = onStart,
                        enabled = !isMonitoring
                    ) {
                        Text("Start Service")
                    }

                    Button(
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                        onClick = onStop,
                        enabled = isMonitoring
                    ) {
                        Text("Stop Service")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Nearby BLE Devices (${devices.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Scanning for Polar Loop, Verity Sense, H10 sensors...",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
            }

            Button(
                onClick = onTriggerScan,
                enabled = isMonitoring,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text("Scan")
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Direct connect fallback card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "Direct Connect by Device ID",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "If BLE scanner is throttled, enter the 8-character device ID printed on your Polar sensor (e.g. C2148A24):",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = manualDeviceId,
                        onValueChange = { manualDeviceId = it.trim().uppercase() },
                        placeholder = { Text("e.g. C2148A24") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    Button(
                        onClick = {
                            if (manualDeviceId.isNotEmpty()) {
                                onConnect(manualDeviceId)
                            }
                        },
                        enabled = isMonitoring && manualDeviceId.isNotEmpty()
                    ) {
                        Text("Connect")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (devices.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (isMonitoring) {
                        "No Polar devices discovered yet.\nEnsure device is awake/worn, or enter ID above."
                    } else {
                        "Monitoring service is stopped.\nStart service on Dashboard to scan."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Gray
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(devices) { device ->
                    val isConnected = device.deviceId == connectedDeviceId
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = if (isConnected) Color(0xFFE8F5E9) else MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = device.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "ID: ${device.deviceId}",
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace
                                )
                                Text(
                                    text = "RSSI: ${device.rssi} dBm",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = when {
                                        device.rssi >= -70 -> Color(0xFF388E3C)
                                        device.rssi >= -85 -> Color(0xFFF57C00)
                                        else -> Color(0xFFD32F2F)
                                    }
                                )
                            }

                            if (isConnected) {
                                OutlinedButton(onClick = { onDisconnect(device.deviceId) }) {
                                    Text("Disconnect")
                                }
                            } else {
                                Button(onClick = { onConnect(device.deviceId) }) {
                                    Text("Connect")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DiagnosticsView(
    telemetry: LiveBleDiagnostics,
    logs: List<DiagnosticLogEntry>,
    onCopyLogs: () -> Unit,
    onClearLogs: () -> Unit
) {
    val context = LocalContext.current
    val dailyLogger = remember { DailyTelemetryLogger(context) }
    var archives by remember { mutableStateOf(dailyLogger.listAvailableArchives()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Telemetry Summary Header
        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("State", style = MaterialTheme.typography.labelSmall)
                    Text(telemetry.connectionState, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Streaming", style = MaterialTheme.typography.labelSmall)
                    Text(if (telemetry.isStreamingAcc) "YES" else "NO", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Band Power", style = MaterialTheme.typography.labelSmall)
                    Text("%.3f".format(telemetry.seizurePower3to8Hz), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Total Power", style = MaterialTheme.typography.labelSmall)
                    Text("%.3f".format(telemetry.totalPower), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Daily Telemetry Data Export Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Daily Telemetry Archives (.json.gz)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    OutlinedButton(
                        onClick = { archives = dailyLogger.listAvailableArchives() },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text("Refresh", fontSize = 11.sp)
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))

                if (archives.isEmpty()) {
                    Text(
                        text = "Recording continuous daily telemetry... Archives will appear here automatically (~12-18 MB/day compressed).",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                        fontSize = 12.sp
                    )
                } else {
                    archives.take(3).forEach { archive ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 3.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = archive.dateString,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                                val sizeKb = archive.sizeBytes / 1024
                                val sizeStr = if (sizeKb > 1024) "%.1f MB".format(sizeKb / 1024f) else "$sizeKb KB"
                                Text(
                                    text = sizeStr,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.Gray,
                                    fontSize = 11.sp
                                )
                            }
                            Button(
                                onClick = {
                                    try {
                                        val uri = FileProvider.getUriForFile(
                                            context,
                                            "${context.packageName}.fileprovider",
                                            archive.file
                                        )
                                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                            type = "application/gzip"
                                            putExtra(Intent.EXTRA_STREAM, uri)
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(Intent.createChooser(shareIntent, "Export Daily Telemetry Archive"))
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Export error: ${e.message}", Toast.LENGTH_SHORT).show()
                                    }
                                },
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text("Download / Share", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Action Toolbar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Live Diagnostic Console (${logs.size})",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onClearLogs) {
                    Text("Clear", fontSize = 12.sp)
                }
                Button(onClick = onCopyLogs) {
                    Text("Copy Logs", fontSize = 12.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Scrolling Console
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E1E))
        ) {
            if (logs.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No diagnostic events logged yet.\nStart the service to begin logging.",
                        color = Color.Gray,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(logs) { entry ->
                        val logColor = when (entry.level) {
                            LogLevel.SUCCESS -> Color(0xFF81C784)
                            LogLevel.INFO -> Color(0xFF64B5F6)
                            LogLevel.WARN -> Color(0xFFFFD54F)
                            LogLevel.ERROR -> Color(0xFFE57373)
                        }
                        Text(
                            text = "[${entry.timestamp}] [${entry.level}] ${entry.message}",
                            color = logColor,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 14.sp
                        )
                    }
                }
            }
        }
    }
}
