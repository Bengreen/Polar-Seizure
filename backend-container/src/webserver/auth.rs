//! Authentication extractors and RBAC permission guards for Axum routes.
//!
//! Handles JWT verification, dev-auth mode fallbacks, account suspension checks,
//! and extraction of `UserId`, `AdminOnly`, and `SupportOnly` guards.

use crate::error::AppError;
use crate::state::AppState;
use crate::webserver::dev_auth::CustomClaims;
use axum::{extract::FromRequestParts, http::request::Parts};
use jwt_simple::prelude::*;

/// Axum extractor guard requiring `admin` role privileges.
pub struct AdminOnly;

impl FromRequestParts<AppState> for AdminOnly {
    type Rejection = AppError;

    // References more than 3 PRDs
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let (sub, mut role) = extract_jwt_claims(parts, state).await?;

        let auth_info = get_user_auth_info_by_sub(&state.db_pool, &sub).await;

        if let Some((_, true, _)) = auth_info {
            return Err(AppError::Forbidden("Account is suspended".to_string()));
        }

        if role.is_none() {
            role = auth_info.map(|(r, _, _)| r);
        }

        let role_str = role.unwrap_or_else(|| "user".to_string());

        if role_str == "admin" {
            Ok(AdminOnly)
        } else {
            Err(AppError::Forbidden("Admin role required".to_string()))
        }
    }
}

pub struct SupportOnly;

impl FromRequestParts<AppState> for SupportOnly {
    type Rejection = AppError;

    // References more than 3 PRDs
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let (sub, mut role) = extract_jwt_claims(parts, state).await?;

        let auth_info = get_user_auth_info_by_sub(&state.db_pool, &sub).await;

        if let Some((_, true, _)) = auth_info {
            return Err(AppError::Forbidden("Account is suspended".to_string()));
        }

        if role.is_none() {
            role = auth_info.map(|(r, _, _)| r);
        }

        let role_str = role.unwrap_or_else(|| "user".to_string());

        if role_str == "admin" || role_str == "support" {
            Ok(SupportOnly)
        } else {
            Err(AppError::Forbidden(
                "Support or Admin role required".to_string(),
            ))
        }
    }
}

pub struct UserId(pub i64);

impl FromRequestParts<AppState> for UserId {
    type Rejection = AppError;

    // References more than 3 PRDs
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let (sub, _) = extract_jwt_claims(parts, state).await?;

        let auth_info = get_user_auth_info_by_sub(&state.db_pool, &sub).await;
        if let Some((_, true, _)) = auth_info {
            return Err(AppError::Forbidden("Account is suspended".to_string()));
        }

        let user_id = if let Ok(id) = sub.parse::<i64>() {
            id
        } else if let Some((_, _, Some(id))) = auth_info {
            id
        } else {
            return Err(AppError::Unauthorized("User not found".to_string()));
        };

        Ok(UserId(user_id))
    }
}

pub struct JwtUser {
    pub sub: String,
    pub user_id: Option<i64>,
    pub role: String,
}

impl FromRequestParts<AppState> for JwtUser {
    type Rejection = AppError;

    // References more than 3 PRDs
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let (sub, role) = extract_jwt_claims(parts, state).await?;

        let auth_info = get_user_auth_info_by_sub(&state.db_pool, &sub).await;
        if let Some((_, true, _)) = auth_info {
            return Err(AppError::Forbidden("Account is suspended".to_string()));
        }

        let user_id = if let Ok(id) = sub.parse::<i64>() {
            Some(id)
        } else {
            auth_info.as_ref().and_then(|(_, _, id)| *id)
        };

        let role_str = role
            .or_else(|| auth_info.map(|(r, _, _)| r))
            .unwrap_or_else(|| "user".to_string());

        Ok(JwtUser {
            sub,
            user_id,
            role: role_str,
        })
    }
}

pub struct OptionalJwtUser(pub Option<JwtUser>);

impl FromRequestParts<AppState> for OptionalJwtUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = JwtUser::from_request_parts(parts, state).await.ok();
        Ok(OptionalJwtUser(user))
    }
}

#[derive(Debug, Clone)]
pub struct RawToken(pub String);

#[derive(Debug, Clone, serde::Deserialize)]
pub struct JwtPayload {
    pub sub: String,
    #[serde(default)]
    pub sward_roles: Vec<String>,
}

fn decode_base64(s: &str) -> Result<Vec<u8>, AppError> {
    use base64::{
        Engine as _,
        engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD},
    };
    STANDARD
        .decode(s)
        .or_else(|_| STANDARD_NO_PAD.decode(s))
        .or_else(|_| URL_SAFE.decode(s))
        .or_else(|_| URL_SAFE_NO_PAD.decode(s))
        .map_err(|e| AppError::Unauthorized(format!("Failed to decode base64 x-jwt-payload: {e}")))
}

#[derive(Debug, serde::Deserialize)]
struct DirectBearerClaims {
    pub sub: Option<String>,
    #[serde(default)]
    pub sward_roles: Vec<String>,
    #[serde(default)]
    pub realm_access: Option<DirectRealmAccess>,
}

#[derive(Debug, serde::Deserialize)]
struct DirectRealmAccess {
    #[serde(default)]
    pub roles: Vec<String>,
}

// PRD Reference: 0001, 0014
async fn extract_jwt_claims(
    parts: &mut Parts,
    state: &AppState,
) -> Result<(String, Option<String>), AppError> {
    // Retain the raw token if Authorization header is present
    if let Some(auth_header) = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        if auth_header.starts_with("Bearer ") {
            let token = &auth_header["Bearer ".len()..];
            parts.extensions.insert(RawToken(token.to_string()));
        }
    }

    if let Some(jwt_payload_header) = parts.headers.get("x-jwt-payload") {
        let payload_str = jwt_payload_header.to_str().map_err(|_| {
            AppError::Unauthorized("Invalid x-jwt-payload header format".to_string())
        })?;

        let decoded_bytes = decode_base64(payload_str)?;
        let decoded_str = String::from_utf8(decoded_bytes).map_err(|e| {
            AppError::Unauthorized(format!("Invalid UTF-8 in decoded x-jwt-payload: {e}"))
        })?;

        let payload: JwtPayload = serde_json::from_str(&decoded_str).map_err(|e| {
            AppError::Unauthorized(format!("Failed to parse x-jwt-payload JSON: {e}"))
        })?;

        if payload.sub.is_empty() {
            return Err(AppError::Unauthorized("Missing subject claim".to_string()));
        }

        let role = payload.sward_roles.first().cloned();
        return Ok((payload.sub, role));
    }

    let auth_header = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    if !state.config.debugging.enable_dev_auth {
        let header_val = auth_header.ok_or_else(|| {
            AppError::Unauthorized("Missing Authorization or x-jwt-payload header".to_string())
        })?;

        if !header_val.starts_with("Bearer ") {
            return Err(AppError::Unauthorized(
                "Invalid Authorization header format".to_string(),
            ));
        }

        let token = &header_val["Bearer ".len()..];
        let parts_vec: Vec<&str> = token.split('.').collect();
        if parts_vec.len() != 3 {
            return Err(AppError::Unauthorized(
                "Invalid Bearer token format".to_string(),
            ));
        }

        let payload_bytes = decode_base64(parts_vec[1])?;
        let payload_str = String::from_utf8(payload_bytes).map_err(|e| {
            AppError::Unauthorized(format!("Invalid UTF-8 in Bearer token payload: {e}"))
        })?;

        let claims: DirectBearerClaims = serde_json::from_str(&payload_str).map_err(|e| {
            AppError::Unauthorized(format!("Failed to parse Bearer token claims: {e}"))
        })?;

        let sub = claims.sub.filter(|s| !s.is_empty()).ok_or_else(|| {
            AppError::Unauthorized("Missing subject claim in Bearer token".to_string())
        })?;

        let role = claims.sward_roles.first().cloned().or_else(|| {
            claims
                .realm_access
                .as_ref()
                .and_then(|r| r.roles.first().cloned())
        });

        return Ok((sub, role));
    }

    let auth_header_val = match auth_header {
        Some(val) if val.starts_with("Bearer ") => val,
        _ => {
            if let Some(user_id_h) = parts.headers.get("x-user-id").and_then(|h| h.to_str().ok()) {
                let role_h = parts
                    .headers
                    .get("x-user-role")
                    .and_then(|h| h.to_str().ok())
                    .map(|r| r.to_string());
                return Ok((user_id_h.to_string(), role_h));
            }
            return Err(AppError::Unauthorized(
                "Missing Authorization header".to_string(),
            ));
        }
    };

    let token = &auth_header_val["Bearer ".len()..];

    let public_key = if let Some(keypair) = &state.dev_jwt_keypair {
        keypair.public_key()
    } else {
        return Err(AppError::Unauthorized(
            "Dev auth is not enabled, missing public key".to_string(),
        ));
    };

    let mut verification_options = VerificationOptions::default();
    verification_options.allowed_audiences =
        Some(std::collections::HashSet::from(["sward-api".to_string()]));
    verification_options.allowed_issuers = Some(std::collections::HashSet::from([
        "http://localhost:8080".to_string(),
    ]));

    let claims = public_key
        .verify_token::<CustomClaims>(token, Some(verification_options))
        .map_err(|e| AppError::Unauthorized(format!("Invalid token: {e}")))?;

    let user_id_str = claims
        .subject
        .ok_or_else(|| AppError::Unauthorized("Missing subject claim".to_string()))?;

    let role = claims.custom.sward_roles.first().cloned();

    Ok((user_id_str, role))
}

pub async fn get_user_auth_info_by_sub(
    pool: &sqlx::PgPool,
    sub: &str,
) -> Option<(String, bool, Option<i64>)> {
    if let Ok(id) = sub.parse::<i64>() {
        sqlx::query_as::<_, (String, bool, i64)>(
            "SELECT role::text, is_suspended, id FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|(role, suspended, id)| (role, suspended, Some(id)))
    } else {
        let res = sqlx::query_as::<_, (String, bool, i64)>(
            "SELECT role::text, is_suspended, id FROM users WHERE keycloak_sub = $1",
        )
        .bind(sub)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

        if res.is_some() {
            return res.map(|(role, suspended, id)| (role, suspended, Some(id)));
        }
        None
    }
}

pub async fn get_user_auth_info(pool: &sqlx::PgPool, user_id: i64) -> Option<(String, bool)> {
    sqlx::query_as::<_, (String, bool)>("SELECT role::text, is_suspended FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

// References more than 3 PRDs
pub async fn get_user_role(pool: &sqlx::PgPool, user_id: i64) -> Option<String> {
    get_user_auth_info(pool, user_id)
        .await
        .map(|(role, _)| role)
}

// PRD Reference: 0013
pub async fn check_is_admin(pool: &sqlx::PgPool, user_id: i64) -> bool {
    get_user_role(pool, user_id)
        .await
        .map(|role| role == "admin")
        .unwrap_or(false)
}
