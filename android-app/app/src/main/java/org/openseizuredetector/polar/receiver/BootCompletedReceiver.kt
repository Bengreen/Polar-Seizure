package org.openseizuredetector.polar.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel
import org.openseizuredetector.polar.service.PolarForegroundService

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED ||
            intent?.action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            DiagnosticManager.log(LogLevel.INFO, "Device boot completed: Autostarting PolarForegroundService...")
            val serviceIntent = Intent(context, PolarForegroundService::class.java).apply {
                action = PolarForegroundService.ACTION_START
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } catch (e: Exception) {
                DiagnosticManager.log(LogLevel.ERROR, "Failed to autostart service on boot: ${e.message}")
            }
        }
    }
}
