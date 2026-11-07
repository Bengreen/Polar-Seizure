//! Administrative management and audit logging HTTP handlers.
//!
//! Provides global cross-tenant listing endpoints for support and admin users.

use crate::error::AppError;
use crate::models::{AuditLog, Event, Farm, Field};
use crate::state::AppState;
use crate::webserver::auth;
use axum::{Json, extract::State};

/// Administrative health status check handler.
// References more than 3 PRDs
pub async fn admin_health(_: auth::SupportOnly) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({ "status": "ok", "admin": true })))
}

// References more than 3 PRDs
pub async fn admin_list_farms(
    _: auth::SupportOnly,
    State(state): State<AppState>,
) -> Result<Json<Vec<Farm>>, AppError> {
    log_admin_action(
        &state.db_pool,
        None, // In a real app, we'd get the user ID from auth
        "list_farms",
        Some("farm"),
        None,
        Some("Admin viewed all farms"),
    )
    .await?;

    let farms = sqlx::query_as::<_, Farm>("SELECT * FROM farms")
        .fetch_all(&state.db_pool)
        .await?;
    Ok(Json(farms))
}

// References more than 3 PRDs
pub async fn admin_list_fields(
    _: auth::SupportOnly,
    State(state): State<AppState>,
) -> Result<Json<Vec<Field>>, AppError> {
    let fields = sqlx::query_as::<_, Field>("SELECT * FROM fields")
        .fetch_all(&state.db_pool)
        .await?;
    Ok(Json(fields))
}

// References more than 3 PRDs
pub async fn admin_list_events(
    _: auth::SupportOnly,
    State(state): State<AppState>,
) -> Result<Json<Vec<Event>>, AppError> {
    let events = sqlx::query_as::<_, Event>("SELECT * FROM events")
        .fetch_all(&state.db_pool)
        .await?;
    Ok(Json(events))
}

// PRD Reference: 0013
pub async fn admin_list_audit_logs(
    _: auth::SupportOnly,
    State(state): State<AppState>,
) -> Result<Json<Vec<AuditLog>>, AppError> {
    let logs = sqlx::query_as::<_, AuditLog>("SELECT * FROM audit_logs ORDER BY created_at DESC")
        .fetch_all(&state.db_pool)
        .await?;
    Ok(Json(logs))
}

// PRD Reference: 0013
pub async fn log_admin_action(
    pool: &sqlx::PgPool,
    user_id: Option<i64>,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<i64>,
    details: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(pool)
    .await?;
    Ok(())
}
