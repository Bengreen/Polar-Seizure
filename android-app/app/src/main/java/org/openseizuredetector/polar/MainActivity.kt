package org.openseizuredetector.polar

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
    var isMonitoring by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }

    val discoveredDevices by DiagnosticManager.discoveredDevices.collectAsState()
    val telemetry by DiagnosticManager.telemetry.collectAsState()
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
            isMonitoring = true
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
            isMonitoring = true
            onStartService()
        } else {
            permissionLauncher.launch(missing.toTypedArray())
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
                Text(
                    text = "Polar-Seizure Monitor",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )

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
                    isMonitoring = isMonitoring,
                    telemetry = telemetry,
                    onStart = { checkAndStartService() },
                    onStop = {
                        isMonitoring = false
                        onStopService()
                    }
                )
                1 -> DevicesView(
                    isMonitoring = isMonitoring,
                    devices = discoveredDevices,
                    connectedDeviceId = telemetry.connectedDeviceId,
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
    isMonitoring: Boolean,
    telemetry: LiveBleDiagnostics,
    onStart: () -> Unit,
    onStop: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Status Card
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
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Connection: ${telemetry.connectionState}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = if (telemetry.connectedDeviceName != null) {
                        "Target: ${telemetry.connectedDeviceName} (${telemetry.connectedDeviceId})"
                    } else {
                        "No device connected"
                    },
                    style = MaterialTheme.typography.bodyMedium
                )
                if (telemetry.batteryLevel != null) {
                    Text(
                        text = "Wristband Battery: ${telemetry.batteryLevel}%",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        // Live DSP Energy Card
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Spectral Energy (3–8 Hz Seizure Band)", style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(8.dp))

                val ratioProgress = (telemetry.energyRatioPercent / 100.0).toFloat().coerceIn(0f, 1f)
                LinearProgressIndicator(
                    progress = { ratioProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = if (telemetry.energyRatioPercent >= 50.0) Color.Red else Color(0xFF4CAF50),
                )
                Spacer(modifier = Modifier.height(6.dp))
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

        // Accel preview
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Live Accelerometer Magnitude", style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "X: %+.2fg  Y: %+.2fg  Z: %+.2fg  |a|: %.2fg".format(
                        telemetry.lastAccX,
                        telemetry.lastAccY,
                        telemetry.lastAccZ,
                        telemetry.lastMagnitude
                    ),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp
                )
                Text(
                    text = "Packet Latency: ${telemetry.lastPacketLatencyMs} ms",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Service Controls
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

@Composable
fun DevicesView(
    isMonitoring: Boolean,
    devices: List<DiscoveredDevice>,
    connectedDeviceId: String?,
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

        Spacer(modifier = Modifier.height(12.dp))

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
