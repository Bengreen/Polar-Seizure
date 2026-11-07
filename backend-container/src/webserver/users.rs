//! User profile and onboarding management HTTP handlers.

use crate::error::AppError;
use crate::models::User;
use crate::state::AppState;
use axum::{Json, extract::State};

// References more than 3 PRDs
pub async fn list_users(State(state): State<AppState>) -> Result<Json<Vec<User>>, AppError> {
    let env = state.config.debugging.environment.as_str();
    let dev_auth = state.config.debugging.enable_dev_auth;
    if env != "development" && env != "testing" && !dev_auth {
        return Err(AppError::Forbidden(
            "User directory listing is disabled in this environment".to_string(),
        ));
    }

    let users =
        sqlx::query_as::<_, User>("SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id GROUP BY u.id")
            .fetch_all(&state.db_pool)
            .await;
    Ok(Json(users?))
}

// References more than 3 PRDs
pub async fn create_user(
    State(state): State<AppState>,
    caller: crate::webserver::auth::OptionalJwtUser,
    Json(mut user): Json<User>,
) -> Result<Json<User>, AppError> {
    if user.keycloak_sub.is_none() {
        if let Some(c) = caller.0 {
            if !c.sub.is_empty() && c.sub.parse::<i64>().is_err() {
                user.keycloak_sub = Some(c.sub);
            }
        }
    }
    let mut tx = state.db_pool.begin().await?;
    let log_level = if user.client_log_level.is_empty() {
        "INFO"
    } else {
        &user.client_log_level
    };

    let effective_sub = user.keycloak_sub.or_else(|| {
        if user.id > 0 {
            Some(user.id.to_string())
        } else {
            None
        }
    });

    let new_user: User = loop {
        if user.id > 0 {
            let inserted = sqlx::query_as::<_, User>(
                "INSERT INTO users (id, name, email, role, phone, description, is_suspended, client_log_level, keycloak_sub) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, email, role, phone, description, is_suspended, client_log_level, keycloak_sub, NULL AS modules",
            )
            .bind(user.id)
            .bind(&user.name)
            .bind(&user.email)
            .bind(&user.role)
            .bind(&user.phone)
            .bind(&user.description)
            .bind(user.is_suspended)
            .bind(log_level)
            .bind(&effective_sub)
            .fetch_one(&mut *tx)
            .await?;

            break inserted;
        } else {
            let res = sqlx::query_as::<_, User>(
                "INSERT INTO users (name, email, role, phone, description, is_suspended, client_log_level, keycloak_sub) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, email, role, phone, description, is_suspended, client_log_level, keycloak_sub, NULL AS modules",
            )
            .bind(&user.name)
            .bind(&user.email)
            .bind(&user.role)
            .bind(&user.phone)
            .bind(&user.description)
            .bind(user.is_suspended)
            .bind(log_level)
            .bind(&effective_sub)
            .fetch_one(&mut *tx)
            .await;

            match res {
                Ok(inserted) => break inserted,
                Err(sqlx::Error::Database(db_err)) if db_err.constraint() == Some("users_pkey") => {
                    // Sequence counter generated an ID that collides with an explicit ID; increment sequence and retry within the transaction
                    sqlx::query("SELECT nextval(pg_get_serial_sequence('users', 'id'))")
                        .execute(&mut *tx)
                        .await?;
                    continue;
                }
                Err(e) => return Err(AppError::from(e)),
            }
        }
    };

    if let Some(modules) = &user.modules {
        if !modules.is_empty() {
            sqlx::query("INSERT INTO user_modules (user_id, module_id) SELECT $1, id FROM modules WHERE name = ANY($2)")
                .bind(new_user.id)
                .bind(modules)
                .execute(&mut *tx)
                .await?;
        }
    }

    let final_user = sqlx::query_as::<_, User>(
        "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.id = $1 GROUP BY u.id",
    )
    .bind(new_user.id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(final_user))
}

// References more than 3 PRDs
pub async fn get_user(
    State(state): State<AppState>,
    caller: crate::webserver::auth::JwtUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<User>, AppError> {
    if caller.sub != id
        && caller.user_id.map(|uid| uid.to_string()) != Some(id.clone())
        && caller.role != "admin"
        && caller.role != "support"
    {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    let user = if let Ok(numeric_id) = id.parse::<i64>() {
        sqlx::query_as::<_, User>(
            "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.id = $1 OR u.keycloak_sub = $2 GROUP BY u.id",
        )
        .bind(numeric_id)
        .bind(&id)
        .fetch_optional(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, User>(
            "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.keycloak_sub = $1 GROUP BY u.id",
        )
        .bind(&id)
        .fetch_optional(&state.db_pool)
        .await?
    };

    match user {
        Some(u) => Ok(Json(u)),
        None => Err(AppError::NotFound(format!("User {id} not found"))),
    }
}

// References more than 3 PRDs
pub async fn update_user(
    State(state): State<AppState>,
    caller: crate::webserver::auth::JwtUser,
    raw_token: Option<axum::Extension<crate::webserver::auth::RawToken>>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(user): Json<User>,
) -> Result<Json<User>, AppError> {
    if caller.sub != id
        && caller.user_id.map(|uid| uid.to_string()) != Some(id.clone())
        && caller.role != "admin"
    {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    let mut tx = state.db_pool.begin().await?;

    let existing_user = if let Ok(numeric_id) = id.parse::<i64>() {
        sqlx::query_as::<_, User>(
            "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.id = $1 OR u.keycloak_sub = $2 GROUP BY u.id",
        )
        .bind(numeric_id)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
    } else {
        sqlx::query_as::<_, User>(
            "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.keycloak_sub = $1 GROUP BY u.id",
        )
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
    }
    .ok_or_else(|| AppError::NotFound(format!("User {id} not found")))?;

    let db_id = existing_user.id;
    let is_admin = caller.role == "admin";

    let role_to_save = if is_admin {
        &user.role
    } else {
        &existing_user.role
    };
    let is_suspended_to_save = if is_admin {
        user.is_suspended
    } else {
        existing_user.is_suspended
    };
    let log_level_to_save = if is_admin {
        if user.client_log_level.is_empty() {
            "INFO"
        } else {
            &user.client_log_level
        }
    } else {
        &existing_user.client_log_level
    };
    let modules_to_save = if is_admin {
        &user.modules
    } else {
        &existing_user.modules
    };
    let keycloak_sub_to_save = user
        .keycloak_sub
        .as_ref()
        .or(existing_user.keycloak_sub.as_ref());

    sqlx::query(
        "UPDATE users SET name = $1, email = $2, role = $3, phone = $4, description = $5, is_suspended = $6, client_log_level = $7, keycloak_sub = $8 WHERE id = $9",
    )
    .bind(&user.name)
    .bind(&user.email)
    .bind(role_to_save)
    .bind(&user.phone)
    .bind(&user.description)
    .bind(is_suspended_to_save)
    .bind(log_level_to_save)
    .bind(keycloak_sub_to_save)
    .bind(db_id)
    .execute(&mut *tx)
    .await?;

    if is_admin {
        if let Some(modules) = modules_to_save {
            sqlx::query("DELETE FROM user_modules WHERE user_id = $1")
                .bind(db_id)
                .execute(&mut *tx)
                .await?;
            if !modules.is_empty() {
                sqlx::query("INSERT INTO user_modules (user_id, module_id) SELECT $1, id FROM modules WHERE name = ANY($2)")
                    .bind(db_id)
                    .bind(modules)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    let raw_token_str = raw_token.map(|axum::Extension(rt)| rt.0);
    let empty_modules = Vec::new();
    let modules_slice = modules_to_save.as_ref().unwrap_or(&empty_modules);

    crate::service::keycloak::sync_user_to_keycloak(
        &state.config,
        raw_token_str.as_deref(),
        &user.email,
        !is_suspended_to_save,
        is_suspended_to_save,
        modules_slice,
    )
    .await?;

    tx.commit().await?;

    let updated_user = sqlx::query_as::<_, User>(
        "SELECT u.id, u.name, u.email, u.role, u.phone, u.description, u.is_suspended, u.client_log_level, u.keycloak_sub, ARRAY_AGG(m.name) FILTER (WHERE m.name IS NOT NULL) AS modules FROM users u LEFT JOIN user_modules um ON u.id = um.user_id LEFT JOIN modules m ON um.module_id = m.id WHERE u.id = $1 GROUP BY u.id",
    )
    .bind(db_id)
    .fetch_one(&state.db_pool)
    .await?;

    Ok(Json(updated_user))
}

// References more than 3 PRDs
pub async fn delete_user(
    State(state): State<AppState>,
    caller: crate::webserver::auth::JwtUser,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    if caller.sub != id
        && caller.user_id.map(|uid| uid.to_string()) != Some(id.clone())
        && caller.role != "admin"
    {
        return Err(AppError::Forbidden("Access denied".to_string()));
    }

    let env = state.config.debugging.environment.as_str();
    let dev_auth = state.config.debugging.enable_dev_auth;
    if env != "development" && env != "testing" && !dev_auth {
        return Err(AppError::Forbidden(
            "User deletion is disabled in this environment".to_string(),
        ));
    }

    let result = if let Ok(numeric_id) = id.parse::<i64>() {
        sqlx::query("DELETE FROM users WHERE id = $1 OR keycloak_sub = $2")
            .bind(numeric_id)
            .bind(&id)
            .execute(&state.db_pool)
            .await?
    } else {
        sqlx::query("DELETE FROM users WHERE keycloak_sub = $1")
            .bind(&id)
            .execute(&state.db_pool)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User not found".to_string()));
    }

    if let Ok(numeric_id) = id.parse::<i64>() {
        state.farms_cache.write().await.remove(&numeric_id);
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}
