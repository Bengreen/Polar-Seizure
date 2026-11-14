package org.openseizuredetector.polar.ui

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import java.io.File
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.openseizuredetector.polar.alert.AlertHistoryRecord
import org.openseizuredetector.polar.incident.IncidentDataRecorder
import org.openseizuredetector.polar.incident.IncidentTelemetryDetail
import org.openseizuredetector.polar.model.EmergencyAlertType

/**
 * On-demand Alert & Telemetry Viewer Modal.
 * Shows detailed breakdown of vital metrics, GPS position, SMS delivery count,
 * and if an incident capture exists, plots the contiguous ±90s waveform on demand.
 */
@Composable
fun AlertDetailDialog(
    alert: AlertHistoryRecord,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    incidentRecorder: IncidentDataRecorder,
    context: Context
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = alert.alertType.smsPrefix,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = if (alert.alertType == EmergencyAlertType.TEST) Color(0xFF1976D2) else Color(0xFFC62828)
                        )
                        Text(
                            text = alert.dateString,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray
                        )
                    }
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = if (alert.alertType == EmergencyAlertType.TEST) Color(0xFFE3F2FD) else Color(0xFFFFEBEE)
                        )
                    ) {
                        Text(
                            text = "${alert.smsSentCount} SMS Sent",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (alert.alertType == EmergencyAlertType.TEST) Color(0xFF1565C0) else Color(0xFFB71C1C)
                        )
                    }
                }

                // Vitals Snapshot Table
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "Vital Signs at Trigger Time (T0)",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Heart Rate (Optical PPG):", style = MaterialTheme.typography.bodySmall)
                            Text(
                                text = alert.heartRateBpm?.let { "$it bpm" } ?: "Not Available",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Seizure Band Power (3-8 Hz):", style = MaterialTheme.typography.bodySmall)
                            Text(
                                text = "%.4f".format(Locale.US, alert.seizurePower3to8Hz),
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Energy Ratio (3-8Hz / Total):", style = MaterialTheme.typography.bodySmall)
                            Text(
                                text = "%.1f%%".format(Locale.US, alert.energyRatioPercent),
                                fontWeight = FontWeight.Bold,
                                color = if (alert.energyRatioPercent >= 45.0) Color(0xFFC62828) else Color.Unspecified,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        if (alert.location != null) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("GPS Fix:", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    text = alert.location,
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }

                // Waveform Telemetry Viewer (if associated incident capture exists or matching timestamp)
                val incidentDir = File(context.filesDir, "incidents")
                val targetFile = alert.incidentFileName?.let { File(incidentDir, it) }?.takeIf { it.exists() }
                    ?: incidentRecorder.listRecordedIncidents().minByOrNull { Math.abs(it.savedAt - alert.timestampMs) }?.file?.takeIf {
                        Math.abs(it.lastModified() - alert.timestampMs) <= 180_000L
                    }

                if (targetFile != null && targetFile.exists()) {
                    TelemetryWaveformSection(
                        file = targetFile,
                        incidentRecorder = incidentRecorder
                    )
                } else {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "High-Rate Telemetry Window (±90s)",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleSmall
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Capturing post-alert window or sensor buffer was offline during trigger.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.Gray
                            )
                        }
                    }
                }

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = onShare) {
                        Text("Share / Export")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(onClick = onDismiss) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

/**
 * Standalone Telemetry Inspection Dialog for raw incident captures.
 */
@Composable
fun RawIncidentDetailDialog(
    file: File,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    incidentRecorder: IncidentDataRecorder
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Telemetry Capture Viewer",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp
                        )
                        Text(
                            text = file.name,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
                            fontSize = 11.sp
                        )
                    }
                    Text(
                        text = "${(file.length() / 1024).coerceAtLeast(1)} KB",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.Gray
                    )
                }

                TelemetryWaveformSection(
                    file = file,
                    incidentRecorder = incidentRecorder
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = onShare) {
                        Text("Export Raw JSON")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(onClick = onDismiss) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

/**
 * Asynchronously loads telemetry and draws the ±90s waveform chart with canvas.
 */
@Composable
fun TelemetryWaveformSection(
    file: File,
    incidentRecorder: IncidentDataRecorder
) {
    var isLoading by remember { mutableStateOf(true) }
    var detail by remember { mutableStateOf<IncidentTelemetryDetail?>(null) }

    LaunchedEffect(file) {
        isLoading = true
        detail = withContext(Dispatchers.IO) {
            incidentRecorder.loadIncidentDetail(file)
        }
        isLoading = false
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "High-Rate Telemetry Window (±90s)",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall
                )
                if (detail != null) {
                    Text(
                        text = "${detail!!.accSamples.size} ACC | ${detail!!.ppgSamples.size} PPG",
                        fontSize = 11.sp,
                        color = Color.Gray
                    )
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Loading 180s telemetry waveform...", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            } else if (detail == null || detail!!.accSamples.isEmpty()) {
                Text(
                    text = "No samples recorded in this capture window.",
                    fontSize = 12.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            } else {
                val samples = detail!!.accSamples
                // Render Canvas Waveform
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(130.dp)
                        .background(Color(0xFF1E1E1E), RoundedCornerShape(8.dp))
                        .padding(8.dp)
                ) {
                    Canvas(modifier = Modifier.matchParentSize()) {
                        val w = size.width
                        val h = size.height
                        val midY = h / 2f

                        // Center reference zero line
                        drawLine(
                            color = Color.DarkGray,
                            start = Offset(0f, midY),
                            end = Offset(w, midY),
                            strokeWidth = 1f
                        )

                        // Center T0 trigger marker (90s mark)
                        drawLine(
                            color = Color(0xFFEF5350),
                            start = Offset(w / 2f, 0f),
                            end = Offset(w / 2f, h),
                            strokeWidth = 2f
                        )

                        if (samples.size > 1) {
                            val stepX = w / (samples.size - 1).toFloat()
                            val path = Path()
                            samples.forEachIndexed { i, s ->
                                val xPos = i * stepX
                                // Scale magnitude: 1.0g offset clamped between -2g and +2g
                                val normY = ((s.magnitude) / 2.5f).coerceIn(-1.0f, 1.0f)
                                val yPos = midY - (normY * (h / 2f * 0.85f))
                                if (i == 0) {
                                    path.moveTo(xPos, yPos)
                                } else {
                                    path.lineTo(xPos, yPos)
                                }
                            }
                            drawPath(
                                path = path,
                                color = Color(0xFF00E676),
                                style = Stroke(width = 2f)
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("-90s (Pre-alert)", fontSize = 10.sp, color = Color.Gray)
                    Text("T0 Trigger", fontSize = 10.sp, color = Color(0xFFEF5350), fontWeight = FontWeight.Bold)
                    Text("+90s (Post-alert)", fontSize = 10.sp, color = Color.Gray)
                }

                // PPG / HR overview if present
                val ppgSamplesWithBpm = detail!!.ppgSamples.filter { it.derivedBpm != null }
                if (ppgSamplesWithBpm.isNotEmpty()) {
                    val minBpm = ppgSamplesWithBpm.minOf { it.derivedBpm!! }
                    val maxBpm = ppgSamplesWithBpm.maxOf { it.derivedBpm!! }
                    val avgBpm = ppgSamplesWithBpm.map { it.derivedBpm!! }.average().toInt()
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "HR Range: $minBpm – $maxBpm bpm (avg: $avgBpm bpm)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFFE91E63)
                        )
                    }
                }
            }
        }
    }
}
