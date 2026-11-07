//! Client telemetry log ingestion HTTP handlers.

use crate::error::AppError;
use crate::state::AppState;
use crate::webserver::auth::UserId;
use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

#[derive(Serialize, Deserialize, Debug)]
pub struct ClientLogEvent {
    pub level: String,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub metadata: Option<serde_json::Value>,
}

pub async fn receive_client_logs(
    State(_state): State<AppState>,
    UserId(user_id): UserId,
    Json(logs): Json<Vec<ClientLogEvent>>,
) -> Result<Json<()>, AppError> {
    for log in logs {
        let metadata_str = match &log.metadata {
            Some(m) => format!(" metadata={}", m),
            None => "".to_string(),
        };

        match log.level.to_uppercase().as_str() {
            "DEBUG" => debug!(
                "client_log user_id={} message=\"{}\" timestamp={}{}",
                user_id, log.message, log.timestamp, metadata_str
            ),
            "INFO" => info!(
                "client_log user_id={} message=\"{}\" timestamp={}{}",
                user_id, log.message, log.timestamp, metadata_str
            ),
            "WARN" => warn!(
                "client_log user_id={} message=\"{}\" timestamp={}{}",
                user_id, log.message, log.timestamp, metadata_str
            ),
            "ERROR" => error!(
                "client_log user_id={} message=\"{}\" timestamp={}{}",
                user_id, log.message, log.timestamp, metadata_str
            ),
            _ => info!(
                "client_log user_id={} level={} message=\"{}\" timestamp={}{}",
                user_id, log.level, log.message, log.timestamp, metadata_str
            ),
        }
    }

    Ok(Json(()))
}
