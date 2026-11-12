//! Emergency alert dispatch, SMS incident logging, and acknowledgment endpoints for Polar-Seizure.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::AlertIncident;
use crate::state::AppState;
use crate::webserver::auth::JwtUser;

#[derive(Deserialize, Debug)]
pub struct TriggerAlertPayload {
    pub device_id: String,
    pub alert_type: String, // "PANIC", "SEIZURE", "HIGH_G", "DEADMAN", "TEST"
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub trigger_source: Option<String>,

    pub heart_rate_bpm: Option<f32>,
    pub energy_ratio_pct: Option<f32>,
    pub seizure_band_power: Option<f32>,

    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub location_accuracy_meters: Option<f32>,
    pub maps_url: Option<String>,

    #[serde(default)]
    pub sms_dispatched: bool,
    #[serde(default)]
    pub sms_recipient_count: i32,
    pub sms_recipients: Option<serde_json::Value>,
    pub sms_body: Option<String>,

    pub details: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
pub struct AcknowledgePayload {
    pub carer_name: String,
}

#[derive(Deserialize, Debug)]
pub struct IncidentQuery {
    pub limit: Option<usize>,
    pub since_ms: Option<i64>,
}

/// Triggers or logs an on-device emergency incident (such as an SMS dispatch or panic alert).
pub async fn trigger_alert(
    State(state): State<AppState>,
    user: JwtUser,
    Json(payload): Json<TriggerAlertPayload>,
) -> Result<Json<AlertIncident>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    let alert_id = Uuid::new_v4();
    let triggered_at = Utc::now();

    warn!(
        alert_id = %alert_id,
        user_id = user_id,
        device_id = %payload.device_id,
        alert_type = %payload.alert_type,
        sms_dispatched = payload.sms_dispatched,
        sms_recipient_count = payload.sms_recipient_count,
        "EMERGENCY ALERT / SMS INCIDENT LOGGED"
    );

    let incident = AlertIncident {
        id: alert_id,
        user_id,
        device_id: payload.device_id,
        alert_type: payload.alert_type,
        severity: payload.severity.unwrap_or_else(|| "CRITICAL".to_string()),
        trigger_source: payload
            .trigger_source
            .unwrap_or_else(|| "ON_DEVICE".to_string()),
        heart_rate_bpm: payload.heart_rate_bpm,
        energy_ratio_pct: payload.energy_ratio_pct,
        seizure_band_power: payload.seizure_band_power,
        latitude: payload.latitude,
        longitude: payload.longitude,
        location_accuracy_meters: payload.location_accuracy_meters,
        maps_url: payload.maps_url,
        sms_dispatched: payload.sms_dispatched,
        sms_recipient_count: payload.sms_recipient_count,
        sms_recipients: payload.sms_recipients,
        sms_body: payload.sms_body,
        triggered_at,
        acknowledged_at: None,
        acknowledged_by: None,
        details: payload.details,
    };

    let mut alerts = state.active_alerts.write().await;
    alerts.push(incident.clone());

    Ok(Json(incident))
}

/// Lists all active/unacknowledged emergency alerts across all users or for a requesting carer.
pub async fn list_active_alerts(
    State(state): State<AppState>,
    user: JwtUser,
) -> Result<Json<Vec<AlertIncident>>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    let alerts = state.active_alerts.read().await;
    let active: Vec<AlertIncident> = alerts
        .iter()
        .filter(|a| {
            a.acknowledged_at.is_none()
                && (user.role == "admin" || user.role == "support" || a.user_id == user_id)
        })
        .cloned()
        .collect();

    Ok(Json(active))
}

/// Lists all historical alert incidents for a given user, including SMS dispatches.
pub async fn list_user_incidents(
    State(state): State<AppState>,
    user: JwtUser,
    Path(target_user_id): Path<i64>,
    Query(query): Query<IncidentQuery>,
) -> Result<Json<Vec<AlertIncident>>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    if user_id != target_user_id && user.role != "admin" && user.role != "support" {
        return Err(AppError::Forbidden(
            "Cannot view another user's alert incidents".to_string(),
        ));
    }

    let limit = query.limit.unwrap_or(50).min(200);
    let since_ms = query.since_ms.unwrap_or(0);

    let alerts = state.active_alerts.read().await;
    let mut matching: Vec<AlertIncident> = alerts
        .iter()
        .filter(|a| a.user_id == target_user_id && a.triggered_at.timestamp_millis() >= since_ms)
        .cloned()
        .collect();

    matching.sort_by(|a, b| b.triggered_at.cmp(&a.triggered_at));
    matching.truncate(limit);

    Ok(Json(matching))
}

/// Acknowledges an emergency alert by a carer.
pub async fn acknowledge_alert(
    State(state): State<AppState>,
    Path(alert_id): Path<Uuid>,
    Json(payload): Json<AcknowledgePayload>,
) -> impl IntoResponse {
    let mut alerts = state.active_alerts.write().await;
    if let Some(alert) = alerts.iter_mut().find(|a| a.id == alert_id) {
        alert.acknowledged_at = Some(Utc::now());
        alert.acknowledged_by = Some(payload.carer_name);
        return (StatusCode::OK, Json(json!({"status": "acknowledged"})));
    }

    (
        StatusCode::NOT_FOUND,
        Json(json!({"error": "Alert not found"})),
    )
}
