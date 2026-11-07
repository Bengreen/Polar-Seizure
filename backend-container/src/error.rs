//! Custom application error types and Axum HTTP response implementations.
//!
//! Maps internal application failures, database errors, authentication issues, and serialization
//! errors into structured HTTP status codes and JSON error responses.

use std::io;

use ::hams::error::HamsError;
use axum::extract::rejection::JsonRejection;
use thiserror::Error;
use tracing_subscriber::filter::FromEnvError;

/// Root error type for backend operations and API responses.
#[derive(Error, Debug)]
pub enum AppError {
    /// General internal server error message.
    #[error("General error `{0}`")]
    Message(String),

    /// Client request invalid error (400 Bad Request).
    #[error("Bad Request `{0}`")]
    BadRequest(String),

    /// Operation or service cancelled.
    #[error("Service Cancelled")]
    Cancelled,

    /// Missing or invalid authentication credentials (401 Unauthorized).
    #[error("Unauthorized `{0}`")]
    Unauthorized(String),

    /// Insufficient role or access permissions (403 Forbidden).
    #[error("Forbidden `{0}`")]
    Forbidden(String),

    /// Error originating from Health Monitoring System (HaMS).
    #[error("HaMs error `{0}`")]
    HamsError(#[from] HamsError),

    /// Prometheus recorder or exporter error.
    #[error("Prometheus error `{0}`")]
    PrometheusError(#[from] prometheus::Error),

    /// JSON serialization or deserialization error.
    #[error("Serdes error `{0}`")]
    Serde(#[from] serde_json::Error),

    /// I/O operation error.
    #[error("data store disconnected")]
    Io(#[from] io::Error),

    /// Axum JSON extractor rejection error.
    #[error("Json Rejection `{0}`")]
    JsonRejection(#[from] JsonRejection),

    /// Service shutdown health check failure.
    #[error("Shutdown error")]
    ShutdownCheck,

    /// Service pre-flight startup check failure.
    #[error("PreFlight error")]
    PreflightCheck,

    /// Configuration parsing error from Figment.
    #[error("Figment error `{0}`")]
    FigmentError(#[from] Box<figment::error::Error>),

    /// Environment log filter parsing error.
    #[error("EnvFilter error `{0}`")]
    EnvFilterError(#[from] FromEnvError),

    /// Requested resource was not found (404 Not Found).
    #[error("Not Found: `{0}`")]
    NotFound(String),

    /// Database schema version mismatch error.
    #[error("Schema Mismatch: expected {expected}, actual {actual}")]
    SchemaMismatch {
        /// Expected schema version.
        expected: i32,
        /// Actual detected schema version.
        actual: i32,
    },

    /// Invalid HTTP header value error.
    #[error("Invalid header value")]
    InvalidHeaderValue(#[from] reqwest::header::InvalidHeaderValue),

    /// PostgreSQL database query or connection pool error.
    #[error("Database error")]
    DatabaseError(#[from] sqlx::Error),
}

impl axum::response::IntoResponse for AppError {
    // PRD Reference: 0001
    fn into_response(self) -> axum::response::Response {
        #[derive(serde::Serialize)]
        struct ErrorResponse {
            message: String,
        }

        let (status, message) = match self {
            AppError::Message(msg) => (reqwest::StatusCode::INTERNAL_SERVER_ERROR, msg.to_string()),
            AppError::BadRequest(msg) => (reqwest::StatusCode::BAD_REQUEST, msg.to_string()),
            AppError::NotFound(msg) => (reqwest::StatusCode::NOT_FOUND, msg.to_string()),
            AppError::SchemaMismatch { .. } => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Schema Mismatch".to_string(),
            ),
            AppError::Cancelled => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Cancelled".to_string(),
            ),
            AppError::Unauthorized(msg) => (reqwest::StatusCode::UNAUTHORIZED, msg.to_string()),
            AppError::Forbidden(msg) => (reqwest::StatusCode::FORBIDDEN, msg.to_string()),
            AppError::HamsError(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Hams Error".to_string(),
            ),
            AppError::Serde(_error) => {
                (reqwest::StatusCode::BAD_REQUEST, "Serde Error".to_string())
            }
            AppError::Io(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "IO Error".to_string(),
            ),
            AppError::ShutdownCheck => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Shutdown Check Failed".to_string(),
            ),
            AppError::PreflightCheck => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Preflight Check Failed".to_string(),
            ),
            AppError::FigmentError(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Config Error".to_string(),
            ),
            AppError::JsonRejection(rejection) => (rejection.status(), rejection.body_text()),
            AppError::PrometheusError(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Prometheus Error".to_string(),
            ),
            AppError::EnvFilterError(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "EnvFilter Error".to_string(),
            ),
            AppError::InvalidHeaderValue(_error) => (
                reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid Header Value".to_string(),
            ),
            AppError::DatabaseError(error) => {
                tracing::error!("Database error: {}", error);
                (
                    reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                    "Database Error".to_string(),
                )
            }
        };

        (status, axum::Json(ErrorResponse { message })).into_response()
    }
}
