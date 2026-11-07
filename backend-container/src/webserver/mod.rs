//! HTTP webserver and API router definitions for Polar-Seizure (`ps`).
//!
//! Provides Axum HTTP endpoint routing, CORS middleware integration, Prometheus instrumentation,
//! health checks (HAMS), and graceful cancellation handling.

pub mod admin;
pub mod alerts;
pub mod auth;
pub mod dev_auth;
pub mod logs;
pub mod sync;
pub mod telemetry;
pub mod users;
pub mod watchdog;

use axum::{
    Json, Router,
    routing::{get, post},
};
use axum_prometheus::PrometheusMetricLayer;
use tokio_util::sync::CancellationToken;
use tower_http::{
    cors::CorsLayer,
    trace::{DefaultOnFailure, DefaultOnRequest, DefaultOnResponse, TraceLayer},
};
use tracing::{info, Level};

use crate::error::AppError;
use crate::state::AppState;

/// Basic health check endpoint handler.
pub async fn hello_handler() -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "service": "polar-seizure-backend",
        "status": "operational",
        "shortcode": "ps"
    })))
}

/// Constructs the central Axum API [`Router`] with registered routes and middleware.
pub fn app_router(state: AppState) -> Router {
    let mut router = Router::new()
        // Core diagnostic & info endpoints
        .route("/v0/hello", get(hello_handler))
        .route("/v0/admin/health", get(admin::admin_health))
        .route("/v0/admin/audit-logs", get(admin::admin_list_audit_logs))
        // User & contact management
        .route("/v0/users", get(users::list_users).post(users::create_user))
        .route(
            "/v0/users/{id}",
            get(users::get_user)
                .put(users::update_user)
                .delete(users::delete_user),
        )
        // Client logging & sync
        .route("/v0/logs", post(logs::ingest_log))
        .route("/v0/sync/push", post(sync::push_sync))
        .route("/v0/sync/pull", get(sync::pull_sync))
        // Polar-Seizure telemetry & watchdog endpoints
        .route(
            "/api/v1/telemetry/frame",
            post(telemetry::ingest_telemetry_frame),
        )
        .route(
            "/api/v1/telemetry/{device_id}",
            get(telemetry::get_device_telemetry),
        )
        .route(
            "/api/v1/watchdog/heartbeat",
            post(watchdog::ingest_heartbeat),
        )
        .route(
            "/api/v1/alerts/trigger",
            post(alerts::trigger_alert),
        )
        .route(
            "/api/v1/alerts/active",
            get(alerts::list_active_alerts),
        )
        .route(
            "/api/v1/alerts/{alert_id}/acknowledge",
            post(alerts::acknowledge_alert),
        );

    // Dev auth route
    if state.dev_jwt_keypair.is_some() {
        router = router.route("/dev/token", post(dev_auth::issue_dev_token));
    }

    let metric_layer = PrometheusMetricLayer::new();
    let cors = CorsLayer::permissive();

    router
        .layer(
            TraceLayer::new_for_http()
                .on_request(DefaultOnRequest::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO))
                .on_failure(DefaultOnFailure::new().level(Level::ERROR)),
        )
        .layer(cors)
        .layer(metric_layer)
        .with_state(state)
}

/// Starts the HTTP web server listening on the configured address.
pub async fn start_app_api(
    state: AppState,
    cancel_token: CancellationToken,
) -> Result<(), AppError> {
    let app = app_router(state.clone());
    let addr = state.config.server.address;

    info!("Starting Polar-Seizure backend webserver on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            cancel_token.cancelled().await;
            info!("Received shutdown signal, terminating server gracefully");
        })
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    Ok(())
}
