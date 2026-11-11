package org.openseizuredetector.polar.alert

import android.content.Context
import android.content.SharedPreferences

data class CarerContact(
    val name: String,
    val phoneNumber: String,
    val isEnabled: Boolean = true
)

class CarerContactManager(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "polar_seizure_carer_prefs"
        private const val KEY_CARER_COUNT = "carer_count"
        private const val KEY_NAME_PREFIX = "carer_name_"
        private const val KEY_PHONE_PREFIX = "carer_phone_"
        private const val KEY_ENABLED_PREFIX = "carer_enabled_"
        private const val KEY_PATIENT_NAME = "patient_name"
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getPatientName(): String {
        return prefs.getString(KEY_PATIENT_NAME, "Wearer") ?: "Wearer"
    }

    fun savePatientName(name: String) {
        prefs.edit().putString(KEY_PATIENT_NAME, name.trim()).apply()
    }

    fun getCarerContacts(): List<CarerContact> {
        val count = prefs.getInt(KEY_CARER_COUNT, 0)
        val list = mutableListOf<CarerContact>()
        for (i in 0 until count) {
            val name = prefs.getString("$KEY_NAME_PREFIX$i", "") ?: ""
            val phone = prefs.getString("$KEY_PHONE_PREFIX$i", "") ?: ""
            val enabled = prefs.getBoolean("$KEY_ENABLED_PREFIX$i", true)
            if (phone.isNotBlank()) {
                list.add(CarerContact(name = name, phoneNumber = phone, isEnabled = enabled))
            }
        }
        return list
    }

    fun saveCarerContacts(contacts: List<CarerContact>) {
        val editor = prefs.edit()
        val count = prefs.getInt(KEY_CARER_COUNT, 0)
        for (i in 0 until count) {
            editor.remove("$KEY_NAME_PREFIX$i")
            editor.remove("$KEY_PHONE_PREFIX$i")
            editor.remove("$KEY_ENABLED_PREFIX$i")
        }

        editor.putInt(KEY_CARER_COUNT, contacts.size)
        contacts.forEachIndexed { i, contact ->
            editor.putString("$KEY_NAME_PREFIX$i", contact.name.trim())
            editor.putString("$KEY_PHONE_PREFIX$i", contact.phoneNumber.trim())
            editor.putBoolean("$KEY_ENABLED_PREFIX$i", contact.isEnabled)
        }
        editor.apply()
    }
}
