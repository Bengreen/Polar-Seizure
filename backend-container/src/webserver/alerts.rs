//! Emergency alert dispatch and acknowledgment endpoints for Polar-Seizure.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

use crate::models::AlertRecord;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct TriggerAlertPayload {
    pub device_id: String,
    pub patient_id: String,
    pub alert_type: String,
    pub severity: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct AcknowledgePayload {
    pub carer_name: String,
}

/// Triggers a seizure or watchdog alert and logs it for carer escalation.
pub async fn trigger_alert(
    State(state): State<AppState>,
    Json(payload): Json<TriggerAlertPayload>,
) -> impl IntoResponse {
    let alert_id = Uuid::new_v4();
    warn!(
        alert_id = %alert_id,
        device_id = %payload.device_id,
        patient_id = %payload.patient_id,
        alert_type = %payload.alert_type,
        "EMERGENCY ALERT TRIGGERED"
    );

    let record = AlertRecord {
        id: alert_id,
        device_id: payload.device_id,
        patient_id: payload.patient_id,
        alert_type: payload.alert_type,
        severity: payload.severity,
        triggered_at: chrono::Utc::now(),
        acknowledged_at: None,
        acknowledged_by: None,
        details: payload.details,
    };

    let mut alerts = state.active_alerts.write().await;
    alerts.push(record.clone());

    (StatusCode::CREATED, Json(record))
}

/// Lists all active/unacknowledged emergency alerts.
pub async fn list_active_alerts(State(state): State<AppState>) -> impl IntoResponse {
    let alerts = state.active_alerts.read().await;
    let active: Vec<AlertRecord> = alerts
        .iter()
        .filter(|a| a.acknowledged_at.is_none())
        .cloned()
        .collect();
    Json(active)
}

/// Acknowledges an emergency alert by a carer.
pub async fn acknowledge_alert(
    State(state): State<AppState>,
    Path(alert_id): Path<Uuid>,
    Json(payload): Json<AcknowledgePayload>,
) -> impl IntoResponse {
    let mut alerts = state.active_alerts.write().await;
    if let Some(alert) = alerts.iter_mut().find(|a| a.id == alert_id) {
        alert.acknowledged_at = Some(chrono::Utc::now());
        alert.acknowledged_by = Some(payload.carer_name);
        return (StatusCode::OK, Json(json!({"status": "acknowledged"})));
    }

    (
        StatusCode::NOT_FOUND,
        Json(json!({"error": "Alert not found"})),
    )
}
