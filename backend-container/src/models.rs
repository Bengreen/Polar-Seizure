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
