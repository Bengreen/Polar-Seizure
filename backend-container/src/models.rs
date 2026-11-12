//! Domain models and SQLx database entity mapping definitions for Polar-Seizure (`ps`).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// User access control roles.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// Carer or family member monitoring a patient.
    User,
    /// Clinical or medical staff member.
    Support,
    /// System administrator.
    Admin,
}

/// User entity representing a registered platform user (carer, patient, or admin).
#[derive(Serialize, Deserialize, Clone, Debug, FromRow)]
pub struct User {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    pub email: String,
    pub role: Role,
    pub phone: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub is_suspended: bool,
    pub modules: Option<Vec<String>>,
    #[serde(default)]
    pub client_log_level: String,
    pub keycloak_sub: Option<String>,
}

/// Seizure detection alarm states.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum AlarmState {
    Normal,
    Warning,
    Alarm,
    Disconnected,
}

/// Telemetry frame received from `android-app` or wearable BLE sensor.
#[derive(Serialize, Deserialize, Clone, Debug, FromRow)]
pub struct TelemetryFrame {
    pub device_id: String,
    pub patient_id: String,
    pub timestamp: DateTime<Utc>,
    pub heart_rate: Option<i32>,
    pub battery_percent: i32,
    pub fft_ratio: f32,
    pub max_power_freq: f32,
    pub state: String,
    pub acc_sample_count: Option<i32>,
}

/// Dead man's watchdog heartbeat frame.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WatchdogHeartbeat {
    pub device_id: String,
    pub timestamp: DateTime<Utc>,
    pub battery_level: i32,
    pub charging: bool,
    pub service_status: String,
}

/// Emergency alert record.
#[derive(Serialize, Deserialize, Clone, Debug, FromRow)]
pub struct AlertRecord {
    pub id: Uuid,
    pub device_id: String,
    pub patient_id: String,
    pub alert_type: String,
    pub severity: String,
    pub triggered_at: DateTime<Utc>,
    pub acknowledged_at: Option<DateTime<Utc>>,
    pub acknowledged_by: Option<String>,
    pub details: Option<serde_json::Value>,
}

/// Dynamic telemetry configuration for a user.
#[derive(Serialize, Deserialize, Clone, Debug, FromRow)]
pub struct UserTelemetryConfig {
    pub user_id: i64,
    pub bulk_upload_interval_seconds: i32,
    pub emergency_pre_event_window_seconds: i32,
    pub emergency_post_event_window_seconds: i32,
    pub compress_uploads: bool,
    pub allow_cellular_bulk: bool,
    pub updated_at: DateTime<Utc>,
}

/// Individual telemetry data point within a bulk or emergency payload.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TelemetrySampleItem {
    #[serde(rename = "sample_type", alias = "type")]
    pub sample_type: String, // "dsp", "acc", "ppg", "event"
    pub timestamp_ms: i64,
    pub heart_rate: Option<f32>,
    pub energy_ratio: Option<f32>,
    pub band_power: Option<f32>,
    pub total_power: Option<f32>,
    pub state: Option<String>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub z: Option<f32>,
    pub magnitude: Option<f32>,
}

/// Bulk telemetry upload payload received from `android-app`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BulkTelemetryUploadRequest {
    pub device_id: String,
    #[serde(default = "Uuid::new_v4")]
    pub batch_id: Uuid,
    #[serde(default)]
    pub is_emergency: bool,
    pub emergency_type: Option<String>,
    pub samples: Vec<TelemetrySampleItem>,
}

/// Response returned to the client after processing a bulk or emergency upload.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BulkTelemetryUploadResponse {
    pub status: String,
    pub batch_id: Uuid,
    pub total_received: usize,
    pub ingested_count: usize,
    pub deduplicated_count: usize,
    pub sync_config: TelemetrySyncInstruction,
}

/// Dynamic synchronization instructions returned to the client.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TelemetrySyncInstruction {
    pub next_upload_in_seconds: i32,
    pub emergency_pre_window_seconds: i32,
}

/// Stored telemetry sample entity.
#[derive(Serialize, Deserialize, Clone, Debug, FromRow)]
pub struct StoredTelemetrySample {
    pub id: i64,
    pub user_id: i64,
    pub device_id: String,
    pub sample_type: String,
    pub timestamp_ms: i64,
    pub recorded_at: DateTime<Utc>,
    pub heart_rate_bpm: Option<f32>,
    pub energy_ratio_pct: Option<f32>,
    pub seizure_band_power: Option<f32>,
    pub total_power: Option<f32>,
    pub alarm_state: Option<String>,
    pub acc_x: Option<f32>,
    pub acc_y: Option<f32>,
    pub acc_z: Option<f32>,
    pub acc_magnitude: Option<f32>,
    pub is_emergency: bool,
    pub emergency_type: Option<String>,
    pub batch_id: Uuid,
}
