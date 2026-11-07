//! Administrative management HTTP handlers for Polar-Seizure.

use crate::error::AppError;
use crate::webserver::auth;
use axum::Json;

/// Administrative health status check handler.
pub async fn admin_health(_: auth::SupportOnly) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "status": "ok",
        "admin": true,
        "service": "polar-seizure-backend"
    })))
}
