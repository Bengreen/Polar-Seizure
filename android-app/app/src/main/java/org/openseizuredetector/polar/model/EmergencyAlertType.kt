package org.openseizuredetector.polar.model

enum class EmergencyAlertType(val displayName: String, val smsPrefix: String) {
    PANIC("Panic", "🆘 PANIC ALERT"),
    SEIZURE("Seizure", "🚨 SEIZURE ALARM"),
    HIGH_G("High-G Impact", "⚠️ HIGH-G IMPACT ALERT"),
    TEST("Test", "ℹ️ TEST ALERT")
}
