//! Telemetry frame ingestion, bulk upload de-duplication, and querying endpoints for Polar-Seizure.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::Utc;
use serde::Deserialize;
use tracing::{info, warn};

use crate::error::AppError;
use crate::models::{
    BulkTelemetryUploadRequest, BulkTelemetryUploadResponse, StoredTelemetrySample, TelemetryFrame,
    TelemetrySyncInstruction, UserTelemetryConfig,
};
use crate::state::AppState;
use crate::webserver::auth::JwtUser;

/// Ingests a continuous single telemetry frame from `android-app` or BLE stream.
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

/// Gets the dynamic synchronization and upload cadence configuration for the user.
pub async fn get_user_sync_config(
    State(state): State<AppState>,
    user: JwtUser,
) -> Result<Json<UserTelemetryConfig>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    // Check in-memory cache first
    {
        let configs = state.user_sync_configs.read().await;
        if let Some(cfg) = configs.get(&user_id) {
            return Ok(Json(cfg.clone()));
        }
    }

    // Default configuration if not yet in database
    let default_config = UserTelemetryConfig {
        user_id,
        bulk_upload_interval_seconds: 300,       // Default 5 mins
        emergency_pre_event_window_seconds: 120, // Pre-event 2 mins
        emergency_post_event_window_seconds: 60, // Post-event 1 min
        compress_uploads: true,
        allow_cellular_bulk: true,
        updated_at: Utc::now(),
    };

    Ok(Json(default_config))
}

/// Updates the dynamic synchronization configuration for a specific user.
pub async fn update_user_sync_config(
    State(state): State<AppState>,
    user: JwtUser,
    Json(new_config): Json<UserTelemetryConfig>,
) -> Result<Json<UserTelemetryConfig>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    let mut config = new_config;
    config.user_id = user_id;
    config.updated_at = Utc::now();

    let mut configs = state.user_sync_configs.write().await;
    configs.insert(user_id, config.clone());

    Ok(Json(config))
}

/// Ingests a bulk or emergency telemetry payload from the client with compound de-duplication.
///
/// Deduplication logic:
/// Deduplicates incoming samples by `(user_id, device_id, sample_type, timestamp_ms)`.
/// If emergency is true, updates the live SPA visualizer ring buffer immediately.
pub async fn ingest_bulk_telemetry(
    State(state): State<AppState>,
    user: JwtUser,
    Json(payload): Json<BulkTelemetryUploadRequest>,
) -> Result<Json<BulkTelemetryUploadResponse>, AppError> {
    let user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    let total_received = payload.samples.len();
    let batch_id = payload.batch_id;
    let is_emergency = payload.is_emergency;
    let emergency_type = payload.emergency_type.clone();
    let device_id = payload.device_id.clone();

    if is_emergency {
        warn!(
            user_id = user_id,
            device_id = %device_id,
            emergency_type = ?emergency_type,
            sample_count = total_received,
            "EMERGENCY fast-path telemetry upload received!"
        );
    } else {
        info!(
            user_id = user_id,
            device_id = %device_id,
            batch_id = %batch_id,
            sample_count = total_received,
            "Bulk telemetry upload received"
        );
    }

    // Ingest into in-memory live sample cache for multi-user visualizer and deduplicate against existing keys
    let mut ingested_samples = Vec::new();
    let mut deduplicated_count = 0;

    {
        let mut user_samples_map = state.live_user_samples.write().await;
        let history = user_samples_map.entry(user_id).or_default();

        for sample in payload.samples {
            // Check if compound key (device_id, sample_type, timestamp_ms) already exists in recent history
            let already_exists = history.iter().any(|existing| {
                existing.device_id == device_id
                    && existing.sample_type == sample.sample_type
                    && existing.timestamp_ms == sample.timestamp_ms
            });

            if already_exists {
                deduplicated_count += 1;
            } else {
                let stored = StoredTelemetrySample {
                    id: (history.len() + 1) as i64,
                    user_id,
                    device_id: device_id.clone(),
                    sample_type: sample.sample_type,
                    timestamp_ms: sample.timestamp_ms,
                    recorded_at: Utc::now(),
                    heart_rate_bpm: sample.heart_rate,
                    energy_ratio_pct: sample.energy_ratio,
                    seizure_band_power: sample.band_power,
                    total_power: sample.total_power,
                    alarm_state: sample.state,
                    acc_x: sample.x,
                    acc_y: sample.y,
                    acc_z: sample.z,
                    acc_magnitude: sample.magnitude,
                    is_emergency,
                    emergency_type: emergency_type.clone(),
                    batch_id,
                };
                history.push(stored.clone());
                ingested_samples.push(stored);

                // Keep rolling buffer of recent ~2000 points per user for instant SPA visualizer
                if history.len() > 2000 {
                    history.remove(0);
                }
            }
        }
    }

    let ingested_count = ingested_samples.len();

    // Retrieve active dynamic sync config for this user
    let sync_instruction = {
        let configs = state.user_sync_configs.read().await;
        if let Some(cfg) = configs.get(&user_id) {
            TelemetrySyncInstruction {
                next_upload_in_seconds: cfg.bulk_upload_interval_seconds,
                emergency_pre_window_seconds: cfg.emergency_pre_event_window_seconds,
            }
        } else {
            TelemetrySyncInstruction {
                next_upload_in_seconds: 300,
                emergency_pre_window_seconds: 120,
            }
        }
    };

    Ok(Json(BulkTelemetryUploadResponse {
        status: "success".to_string(),
        batch_id,
        total_received,
        ingested_count,
        deduplicated_count,
        sync_config: sync_instruction,
    }))
}

/// Query parameters for SPA telemetry retrieval.
#[derive(Deserialize, Debug)]
pub struct LiveTelemetryQuery {
    pub since_ms: Option<i64>,
    pub limit: Option<usize>,
}

/// Retrieves stored telemetry points for an authenticated user for consumption by a web SPA dashboard.
pub async fn get_user_live_telemetry(
    State(state): State<AppState>,
    user: JwtUser,
    Path(target_user_id): Path<i64>,
    Query(query): Query<LiveTelemetryQuery>,
) -> Result<Json<Vec<StoredTelemetrySample>>, AppError> {
    let requesting_user_id = user
        .user_id
        .ok_or_else(|| AppError::Unauthorized("Invalid user identity".to_string()))?;

    // Authorization: users can view their own data, while support and admin can view any user
    if requesting_user_id != target_user_id && user.role != "admin" && user.role != "support" {
        return Err(AppError::Forbidden(
            "Cannot view another user's telemetry".to_string(),
        ));
    }

    let limit = query.limit.unwrap_or(300).min(1000);
    let since_ms = query.since_ms.unwrap_or(0);

    let user_samples_map = state.live_user_samples.read().await;
    let history = user_samples_map.get(&target_user_id);

    let result = if let Some(samples) = history {
        samples
            .iter()
            .filter(|s| s.timestamp_ms >= since_ms)
            .rev()
            .take(limit)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    } else {
        Vec::new()
    };

    Ok(Json(result))
}
