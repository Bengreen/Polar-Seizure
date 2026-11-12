//! Shared application state structure for Axum HTTP handlers in Polar-Seizure (`ps`).

use axum_prometheus::metrics_exporter_prometheus::PrometheusHandle;
use jwt_simple::algorithms::RS256KeyPair;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::AppConfig;
use crate::models::{AlertRecord, TelemetryFrame};

/// Thread-safe shared application state passed to HTTP handlers via Axum extractors.
#[derive(Clone)]
pub struct AppState {
    /// Active application configuration parameters.
    pub config: AppConfig,
    /// Prometheus metrics exporter handle.
    pub prometheus_handle: Arc<PrometheusHandle>,
    /// PostgreSQL database connection pool handle.
    pub db_pool: sqlx::PgPool,
    /// Thread-safe in-memory cache of recent telemetry frames indexed by device ID.
    pub telemetry_cache: Arc<RwLock<std::collections::HashMap<String, Vec<TelemetryFrame>>>>,
    /// Thread-safe in-memory cache of recent multi-user samples for live SPA visualization (user_id -> samples).
    pub live_user_samples:
        Arc<RwLock<std::collections::HashMap<i64, Vec<crate::models::StoredTelemetrySample>>>>,
    /// Thread-safe in-memory user telemetry sync configuration cache (user_id -> UserTelemetryConfig).
    pub user_sync_configs:
        Arc<RwLock<std::collections::HashMap<i64, crate::models::UserTelemetryConfig>>>,
    /// Thread-safe list of active emergency alerts.
    pub active_alerts: Arc<RwLock<Vec<AlertRecord>>>,
    /// Optional dev-mode RS256 keypair for signing local JWT tokens.
    pub dev_jwt_keypair: Option<Arc<RS256KeyPair>>,
    /// Optional dev-mode JWKS JSON response string.
    pub dev_jwks_json: Option<String>,
}

impl AppState {
    /// Constructs a new [`AppState`] instance with initialized caches.
    pub fn new(
        config: AppConfig,
        prometheus_handle: PrometheusHandle,
        db_pool: sqlx::PgPool,
        dev_jwt_keypair: Option<Arc<RS256KeyPair>>,
        dev_jwks_json: Option<String>,
    ) -> Self {
        Self {
            config,
            prometheus_handle: Arc::new(prometheus_handle),
            db_pool,
            telemetry_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
            live_user_samples: Arc::new(RwLock::new(std::collections::HashMap::new())),
            user_sync_configs: Arc::new(RwLock::new(std::collections::HashMap::new())),
            active_alerts: Arc::new(RwLock::new(Vec::new())),
            dev_jwt_keypair,
            dev_jwks_json,
        }
    }
}
