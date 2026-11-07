package org.openseizuredetector.polar

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import org.openseizuredetector.polar.model.SeizureAlarmState
import org.openseizuredetector.polar.service.PolarForegroundService

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                MainScreen(
                    onStartService = {
                        val intent = Intent(this, PolarForegroundService::class.java).apply {
                            action = PolarForegroundService.ACTION_START
                        }
                        startForegroundService(intent)
                    },
                    onStopService = {
                        val intent = Intent(this, PolarForegroundService::class.java).apply {
                            action = PolarForegroundService.ACTION_STOP
                        }
                        startService(intent)
                    }
                )
            }
        }
    }
}

@Composable
fun MainScreen(
    onStartService: () -> Unit,
    onStopService: () -> Unit
) {
    var isMonitoring by remember { mutableStateOf(false) }
    var alarmState by remember { mutableStateOf(SeizureAlarmState.NORMAL) }

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Polar-Seizure Monitor",
                style = MaterialTheme.typography.headlineMedium
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = when (alarmState) {
                        SeizureAlarmState.NORMAL -> Color(0xFFE8F5E9)
                        SeizureAlarmState.WARNING -> Color(0xFFFFF9C4)
                        SeizureAlarmState.ALARM -> Color(0xFFFFCDD2)
                        SeizureAlarmState.DISCONNECTED -> Color(0xFFECEFF1)
                    }
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Current State: ${alarmState.name}",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (isMonitoring) "Daemon running in Foreground Service" else "Monitoring Inactive",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        isMonitoring = true
                        onStartService()
                    }
                ) {
                    Text("Start Service")
                }

                Button(
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    onClick = {
                        isMonitoring = false
                        onStopService()
                    }
                ) {
                    Text("Stop Service")
                }
            }
        }
    }
}
