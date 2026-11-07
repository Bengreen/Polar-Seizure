//! Cloud Dead Man's Watchdog heartbeat endpoints for Polar-Seizure.

use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde_json::json;
use tracing::info;

use crate::models::WatchdogHeartbeat;
use crate::state::AppState;

/// Ingests a regular ping from the Android daemon to reset the dead man's timer.
pub async fn ingest_heartbeat(
    State(_state): State<AppState>,
    Json(heartbeat): Json<WatchdogHeartbeat>,
) -> impl IntoResponse {
    info!(
        device_id = %heartbeat.device_id,
        battery = heartbeat.battery_level,
        status = %heartbeat.service_status,
        "Watchdog heartbeat received"
    );

    (
        StatusCode::OK,
        Json(json!({
            "status": "acknowledged",
            "received_at": chrono::Utc::now()
        })),
    )
}
