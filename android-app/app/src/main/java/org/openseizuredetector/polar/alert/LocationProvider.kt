package org.openseizuredetector.polar.alert

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.openseizuredetector.polar.ble.DiagnosticManager
import org.openseizuredetector.polar.ble.LogLevel

data class GeoPosition(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val timestampMs: Long
) {
    fun toMapsUrl(): String = "https://maps.google.com/?q=$latitude,$longitude"
}

class LocationProvider(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(context)
    }

    private var lastKnownPosition: GeoPosition? = null

    fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    fun getCachedPosition(): GeoPosition? = lastKnownPosition

    @SuppressLint("MissingPermission")
    fun requestFreshPosition(onResult: (GeoPosition?) -> Unit) {
        if (!hasLocationPermission()) {
            DiagnosticManager.log(LogLevel.WARN, "Location permission not granted. Cannot acquire GPS coordinates.")
            onResult(null)
            return
        }

        try {
            val cts = CancellationTokenSource()
            fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { location: Location? ->
                    if (location != null) {
                        val pos = GeoPosition(
                            latitude = location.latitude,
                            longitude = location.longitude,
                            accuracyMeters = location.accuracy,
                            timestampMs = location.time
                        )
                        lastKnownPosition = pos
                        DiagnosticManager.log(
                            LogLevel.SUCCESS,
                            "Acquired fresh GPS fix: lat=${pos.latitude}, lng=${pos.longitude} (±${pos.accuracyMeters}m)"
                        )
                        onResult(pos)
                    } else {
                        fallbackToLastLocation(onResult)
                    }
                }
                .addOnFailureListener { error ->
                    DiagnosticManager.log(LogLevel.WARN, "Fused location lookup failed: ${error.localizedMessage}. Attempting fallback...")
                    fallbackToLastLocation(onResult)
                }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Exception in requestFreshPosition: ${e.localizedMessage}")
            fallbackToLastLocation(onResult)
        }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackToLastLocation(onResult: (GeoPosition?) -> Unit) {
        try {
            fusedLocationClient.lastLocation
                .addOnSuccessListener { loc: Location? ->
                    if (loc != null) {
                        val pos = GeoPosition(
                            latitude = loc.latitude,
                            longitude = loc.longitude,
                            accuracyMeters = loc.accuracy,
                            timestampMs = loc.time
                        )
                        lastKnownPosition = pos
                        DiagnosticManager.log(
                            LogLevel.INFO,
                            "Using cached lastLocation: lat=${pos.latitude}, lng=${pos.longitude} (±${pos.accuracyMeters}m)"
                        )
                        onResult(pos)
                    } else {
                        // Fallback to legacy LocationManager
                        fallbackToLocationManager(onResult)
                    }
                }
                .addOnFailureListener {
                    fallbackToLocationManager(onResult)
                }
        } catch (e: Exception) {
            fallbackToLocationManager(onResult)
        }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackToLocationManager(onResult: (GeoPosition?) -> Unit) {
        try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            val gpsLoc = lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            val netLoc = lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            val chosen = gpsLoc ?: netLoc

            if (chosen != null) {
                val pos = GeoPosition(
                    latitude = chosen.latitude,
                    longitude = chosen.longitude,
                    accuracyMeters = chosen.accuracy,
                    timestampMs = chosen.time
                )
                lastKnownPosition = pos
                DiagnosticManager.log(
                    LogLevel.INFO,
                    "Using LocationManager cached location: lat=${pos.latitude}, lng=${pos.longitude}"
                )
                onResult(pos)
            } else {
                DiagnosticManager.log(LogLevel.WARN, "No GPS or network location available.")
                onResult(null)
            }
        } catch (e: Exception) {
            DiagnosticManager.log(LogLevel.ERROR, "Failed to query LocationManager fallback: ${e.localizedMessage}")
            onResult(null)
        }
    }
}
