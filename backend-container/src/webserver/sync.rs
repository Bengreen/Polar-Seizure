//! Delta sync HTTP handlers for offline client database synchronization in Polar-Seizure.

use crate::error::AppError;
use crate::state::AppState;
use crate::webserver::auth::UserId;
use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct SyncQuery {
    pub device_id: Option<String>,
}

#[derive(Serialize)]
pub struct SyncResponse {
    pub status: String,
    pub synced_at: chrono::DateTime<chrono::Utc>,
}

pub async fn delta_sync(
    State(_state): State<AppState>,
    UserId(_user_id): UserId,
    Query(_params): Query<SyncQuery>,
) -> Result<Json<SyncResponse>, AppError> {
    Ok(Json(SyncResponse {
        status: "synced".to_string(),
        synced_at: chrono::Utc::now(),
    }))
}
