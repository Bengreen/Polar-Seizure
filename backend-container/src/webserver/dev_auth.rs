//! Mock development authentication endpoints and dev JWT token generator.

use crate::{error::AppError, state::AppState};
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
};
use jwt_simple::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct DevAuthRequest {
    pub user_id: i64,
    pub role: String,
}

#[derive(Serialize)]
pub struct DevAuthResponse {
    pub access_token: String,
}

#[derive(Serialize, Deserialize)]
pub struct CustomClaims {
    pub sward_roles: Vec<String>,
}

// References more than 3 PRDs
pub async fn generate_token(
    State(state): State<AppState>,
    Json(payload): Json<DevAuthRequest>,
) -> Result<impl IntoResponse, AppError> {
    let keypair = state
        .dev_jwt_keypair
        .as_ref()
        .ok_or_else(|| AppError::Forbidden("Dev auth is not enabled".to_string()))?;

    let custom_claims = CustomClaims {
        sward_roles: vec![payload.role],
    };

    let claims = Claims::with_custom_claims(custom_claims, Duration::from_hours(24))
        .with_issuer("http://localhost:8080")
        .with_audience("sward-api")
        .with_subject(payload.user_id.to_string());

    let token = keypair
        .sign(claims)
        .map_err(|e| AppError::Message(format!("Failed to sign JWT: {e}")))?;

    Ok(Json(DevAuthResponse {
        access_token: token,
    }))
}

// References more than 3 PRDs
pub async fn get_jwks(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let jwks_json = state
        .dev_jwks_json
        .as_ref()
        .ok_or_else(|| AppError::Forbidden("Dev auth is not enabled".to_string()))?;

    Ok((
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        jwks_json.clone(),
    ))
}
