//! Polar-Seizure Backend (`backend-container`) core library.
//!
//! Provides application configuration, state management, Axum HTTP routing,
//! telemetry ingestion, watchdog heartbeat tracking, and HaMS health monitoring.

pub mod config;
pub mod error;
pub mod hams;
pub mod metrics;
pub mod models;
pub mod startup_tools;
pub mod state;
pub mod tokio_tools;
pub mod webserver;

use axum_prometheus::metrics_exporter_prometheus::PrometheusBuilder;
use jwt_simple::algorithms::RS256KeyPair;
use std::ffi::c_void;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tracing::info;

use ::hams::hams::Hams;
use ::hams::probe::AsyncHealthProbe;
use ::hams::probe::FFIProbe;
use ::hams::probe::manual::Manual as ProbeManual;

use crate::config::AppConfig;
use crate::error::AppError;
use crate::metrics::{prometheus_response_free, prometheus_response_mystate};
use crate::state::AppState;
use crate::webserver::start_app_api;

/// The package name of the backend container.
pub const NAME: &str = env!("CARGO_PKG_NAME");

/// The package version of the backend container.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Starts the backend web server with support for graceful cancellation.
///
/// # Arguments
///
/// * `ct` - Tokio cancellation token for triggering service shutdown.
/// * `config` - Loaded application configuration (`AppConfig`).
/// * `hams` - Mutable reference to the HaMS health and monitoring service.
///
/// # Errors
///
/// Returns an [`AppError`] if database migration, health probe registration, or web server startup fails.
// PRD Reference: 0001
pub async fn service_cancellable(
    ct: CancellationToken,
    config: AppConfig,
    hams: &mut Hams,
) -> Result<(), AppError> {
    info!("Starting service {} v{}", NAME, VERSION);

    // Setup Prometheus Recorder
    let metric_handle = PrometheusBuilder::new()
        .install_recorder()
        .map_err(|e| AppError::Message(format!("Failed to install Prometheus recorder: {e}")))?;

    let db_url: url::Url = config.database.url.clone().into();
    let db_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(config.database.max_connections)
        .connect(db_url.as_str())
        .await
        .map_err(|e| AppError::Message(format!("Failed to connect to database: {e}")))?;

    sqlx::migrate!()
        .run(&db_pool)
        .await
        .map_err(|e| AppError::Message(format!("Failed to run database migrations: {e}")))?;

    let mut dev_jwt_keypair = None;
    let mut dev_jwks_json = None;

    if config.debugging.enable_dev_auth {
        info!("Dev auth is enabled. Generating in-memory RS256 keypair for JWT...");
        let keypair = RS256KeyPair::generate(2048)
            .map_err(|e| AppError::Message(format!("Failed to generate RS256 keypair: {e}")))?
            .with_key_id("dev-key-1");

        let public_key = keypair.public_key();
        let jwk_components = public_key.to_components();
        let e = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            &jwk_components.e,
        );
        let n = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            &jwk_components.n,
        );

        let jwks = serde_json::json!({
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": "dev-key-1",
                    "n": n,
                    "e": e,
                }
            ]
        });

        dev_jwt_keypair = Some(Arc::new(keypair));
        dev_jwks_json = Some(jwks.to_string());
    }

    let state = AppState::new(
        config.clone(),
        metric_handle,
        db_pool.clone(),
        dev_jwt_keypair,
        dev_jwks_json,
    );

    if config.startup_checks.enabled {
        startup_tools::run_startup_checks(&config, &db_pool).await?;
    }

    // HaMS Probes
    let db_probe = ProbeManual::new("db-connected", true);
    hams.ready_insert_async(Box::new(FFIProbe::from(db_probe.clone())) as Box<dyn AsyncHealthProbe>).await;

    // HaMS Prometheus Registration
    hams.register_prometheus(
        prometheus_response_mystate,
        prometheus_response_free,
        &state as *const _ as *const c_void,
    )?;

    // Link HaMS shutdown to application cancellation token
    let ct_clone = ct.clone();
    hams.register_shutdown_closure(move || {
        info!("HaMS shutdown callback triggered, cancelling application token");
        ct_clone.cancel();
    })?;

    let server_future = start_app_api(state.clone(), ct.clone());

    server_future.await?;

    Ok(())
}
