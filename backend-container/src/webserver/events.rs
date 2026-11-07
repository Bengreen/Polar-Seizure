//! Field activity event logging HTTP handlers.

use crate::error::AppError;
use crate::models::{Event, FarmRecord, FertilisationPlan, SoilAnalysis};
use crate::state::AppState;
use crate::webserver::auth::UserId;
use axum::extract::Path;
use axum::{Json, extract::State};
use reqwest::StatusCode;

// References more than 3 PRDs
pub async fn list_events(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<Event>>, AppError> {
    let events = sqlx::query_as::<_, Event>(
        "SELECT e.id, e.field_id, e.event_type, e.description, e.date, e.updated_at, e.is_deleted, e.mapp_number, e.eppo_code, e.bbch_growth_stage FROM events e JOIN fields f ON e.field_id = f.id JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND e.is_deleted = FALSE"
    )
    .bind(user_id)
    .fetch_all(&state.db_pool)
    .await?;
    Ok(Json(events))
}

// References more than 3 PRDs
pub async fn create_event(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(event): Json<Event>,
) -> Result<Json<Event>, AppError> {
    // Verify field ownership
    let field_belongs = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE f.id = $1 AND fa.user_id = $2 AND f.is_deleted = FALSE)"
    )
    .bind(event.field_id)
    .bind(user_id)
    .fetch_one(&state.db_pool)
    .await?;

    if !field_belongs {
        return Err(AppError::Forbidden(
            "Field is invalid or unauthorized".to_string(),
        ));
    }

    let new_event = sqlx::query_as::<_, Event>(
        "INSERT INTO events (field_id, event_type, description, date, mapp_number, eppo_code, bbch_growth_stage) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, field_id, event_type, description, date, updated_at, is_deleted, mapp_number, eppo_code, bbch_growth_stage"
    )
    .bind(event.field_id)
    .bind(&event.event_type)
    .bind(&event.description)
    .bind(&event.date)
    .bind(&event.mapp_number)
    .bind(&event.eppo_code)
    .bind(&event.bbch_growth_stage)
    .fetch_one(&state.db_pool)
    .await?;
    Ok(Json(new_event))
}

// References more than 3 PRDs
pub async fn delete_event(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let is_admin = crate::webserver::auth::check_is_admin(&state.db_pool, user_id).await;

    let result = if is_admin {
        sqlx::query("UPDATE events SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(&state.db_pool)
            .await?
    } else {
        sqlx::query("UPDATE events SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND field_id IN (SELECT f.id FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $2)")
            .bind(id)
            .bind(user_id)
            .execute(&state.db_pool)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Event not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// References more than 3 PRDs
pub async fn list_farm_records(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<FarmRecord>>, AppError> {
    let records = sqlx::query_as::<_, FarmRecord>(
        "SELECT fr.id, fr.farm_id, fr.agricultural_area, fr.manure_storage_capacity, fr.year, fr.has_derogation, fr.updated_at, fr.is_deleted FROM farm_records fr JOIN farms fa ON fr.farm_id = fa.id WHERE fa.user_id = $1 AND fr.is_deleted = FALSE"
    )
    .bind(user_id)
    .fetch_all(&state.db_pool)
    .await?;
    Ok(Json(records))
}

// References more than 3 PRDs
pub async fn create_farm_record(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(record): Json<FarmRecord>,
) -> Result<Json<FarmRecord>, AppError> {
    // Verify farm ownership
    let farm_belongs = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM farms WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE)",
    )
    .bind(record.farm_id)
    .bind(user_id)
    .fetch_one(&state.db_pool)
    .await?;

    if !farm_belongs {
        return Err(AppError::Forbidden(
            "Farm is invalid or unauthorized".to_string(),
        ));
    }

    let new_record = sqlx::query_as::<_, FarmRecord>(
        "INSERT INTO farm_records (farm_id, agricultural_area, manure_storage_capacity, year, has_derogation) VALUES ($1, $2, $3, $4, $5) RETURNING id, farm_id, agricultural_area, manure_storage_capacity, year, has_derogation, updated_at, is_deleted"
    )
    .bind(record.farm_id)
    .bind(record.agricultural_area)
    .bind(record.manure_storage_capacity)
    .bind(record.year)
    .bind(record.has_derogation.unwrap_or(false))
    .fetch_one(&state.db_pool)
    .await?;
    Ok(Json(new_record))
}

// References more than 3 PRDs
pub async fn list_soil_analyses(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<SoilAnalysis>>, AppError> {
    let analyses = sqlx::query_as::<_, SoilAnalysis>(
        "SELECT sa.id, sa.field_id, sa.sample_date, sa.ph_level, sa.phosphorus_index, sa.potassium_index, sa.magnesium_index, sa.updated_at, sa.is_deleted FROM soil_analyses sa JOIN fields f ON sa.field_id = f.id JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND sa.is_deleted = FALSE"
    )
    .bind(user_id)
    .fetch_all(&state.db_pool)
    .await?;
    Ok(Json(analyses))
}

// References more than 3 PRDs
pub async fn create_soil_analysis(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(analysis): Json<SoilAnalysis>,
) -> Result<Json<SoilAnalysis>, AppError> {
    // Verify field ownership
    let field_belongs = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE f.id = $1 AND fa.user_id = $2 AND f.is_deleted = FALSE)"
    )
    .bind(analysis.field_id)
    .bind(user_id)
    .fetch_one(&state.db_pool)
    .await?;

    if !field_belongs {
        return Err(AppError::Forbidden(
            "Field is invalid or unauthorized".to_string(),
        ));
    }

    let new_analysis = sqlx::query_as::<_, SoilAnalysis>(
        "INSERT INTO soil_analyses (field_id, sample_date, ph_level, phosphorus_index, potassium_index, magnesium_index) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, field_id, sample_date, ph_level, phosphorus_index, potassium_index, magnesium_index, updated_at, is_deleted"
    )
    .bind(analysis.field_id)
    .bind(&analysis.sample_date)
    .bind(analysis.ph_level)
    .bind(analysis.phosphorus_index)
    .bind(analysis.potassium_index)
    .bind(analysis.magnesium_index)
    .fetch_one(&state.db_pool)
    .await?;
    Ok(Json(new_analysis))
}

// References more than 3 PRDs
pub async fn delete_soil_analysis(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    sqlx::query("UPDATE soil_analyses SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND field_id IN (SELECT f.id FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $2)")
        .bind(id)
        .bind(user_id)
        .execute(&state.db_pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// References more than 3 PRDs
pub async fn list_fertilisation_plans(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<Vec<FertilisationPlan>>, AppError> {
    let plans = sqlx::query_as::<_, FertilisationPlan>(
        "SELECT fp.id, fp.field_id, fp.crop_type, fp.target_yield, fp.nitrogen_requirement, fp.phosphorus_requirement, fp.potassium_requirement, fp.application_date, fp.updated_at, fp.is_deleted FROM fertilisation_plans fp JOIN fields f ON fp.field_id = f.id JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND fp.is_deleted = FALSE"
    )
    .bind(user_id)
    .fetch_all(&state.db_pool)
    .await?;
    Ok(Json(plans))
}

// References more than 3 PRDs
pub async fn create_fertilisation_plan(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(plan): Json<FertilisationPlan>,
) -> Result<Json<FertilisationPlan>, AppError> {
    // Verify field ownership
    let field_belongs = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE f.id = $1 AND fa.user_id = $2 AND f.is_deleted = FALSE)"
    )
    .bind(plan.field_id)
    .bind(user_id)
    .fetch_one(&state.db_pool)
    .await?;

    if !field_belongs {
        return Err(AppError::Forbidden(
            "Field is invalid or unauthorized".to_string(),
        ));
    }

    let new_plan = sqlx::query_as::<_, FertilisationPlan>(
        "INSERT INTO fertilisation_plans (field_id, crop_type, target_yield, nitrogen_requirement, phosphorus_requirement, potassium_requirement, application_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, field_id, crop_type, target_yield, nitrogen_requirement, phosphorus_requirement, potassium_requirement, application_date, updated_at, is_deleted"
    )
    .bind(plan.field_id)
    .bind(&plan.crop_type)
    .bind(plan.target_yield)
    .bind(plan.nitrogen_requirement)
    .bind(plan.phosphorus_requirement)
    .bind(plan.potassium_requirement)
    .bind(&plan.application_date)
    .fetch_one(&state.db_pool)
    .await?;
    Ok(Json(new_plan))
}

// References more than 3 PRDs
pub async fn delete_fertilisation_plan(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    sqlx::query("UPDATE fertilisation_plans SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND field_id IN (SELECT f.id FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $2)")
        .bind(id)
        .bind(user_id)
        .execute(&state.db_pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
