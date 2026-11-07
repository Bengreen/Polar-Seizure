//! Telemetry frame ingestion and querying endpoints for Polar-Seizure.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::info;

use crate::models::TelemetryFrame;
use crate::state::AppState;

/// Ingests a continuous telemetry frame from `android-app` or BLE stream.
pub async fn ingest_telemetry_frame(
    State(state): State<AppState>,
    Json(frame): Json<TelemetryFrame>,
) -> impl IntoResponse {
    info!(
        device_id = %frame.device_id,
        state = %frame.state,
        fft_ratio = frame.fft_ratio,
        "Received telemetry frame"
    );

    let mut cache = state.telemetry_cache.write().await;
    let history = cache.entry(frame.device_id.clone()).or_default();
    history.push(frame);
    if history.len() > 300 {
        history.remove(0);
    }

    StatusCode::ACCEPTED
}

/// Retrieves the most recent telemetry frames for a specific device.
pub async fn get_device_telemetry(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
) -> impl IntoResponse {
    let cache = state.telemetry_cache.read().await;
    let frames = cache.get(&device_id).cloned().unwrap_or_default();
    Json(frames)
}
