//! Delta sync HTTP handlers for offline client database synchronization.

use crate::error::AppError;
use crate::models::{
    ComplianceBreach, Event, Farm, FarmRecord, FertilisationPlan, FertiliserApplication, Field,
    InventoryStorage, OrganicManureApplication, SoilAnalysis, SwardMovement, SyncQuery,
    SyncResponse,
};
use crate::state::AppState;
use crate::webserver::auth::UserId;
use axum::{
    Json,
    extract::{Query, State},
};
use chrono::{DateTime, Utc};

// References more than 3 PRDs
pub async fn delta_sync(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(params): Query<SyncQuery>,
) -> Result<Json<SyncResponse>, AppError> {
    let since: DateTime<Utc> = params
        .since
        .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap_or_default());

    let is_admin = crate::webserver::auth::check_is_admin(&state.db_pool, user_id).await;

    let target_user_id = if is_admin {
        params.user_id
    } else {
        if let Some(requested_uid) = params.user_id {
            if requested_uid != user_id {
                return Err(AppError::Forbidden(
                    "Cannot sync another user's data".to_string(),
                ));
            }
        }
        Some(user_id)
    };

    let has_reports_module = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM user_modules um JOIN modules m ON um.module_id = m.id WHERE um.user_id = $1 AND m.name = 'reports_and_analysis')"
    )
    .bind(target_user_id.unwrap_or(user_id))
    .fetch_one(&state.db_pool)
    .await?;

    let farms = match target_user_id {
        Some(uid) => {
            sqlx::query_as::<_, Farm>(
                "SELECT id, user_id, name, location, has_derogation, photo, updated_at, is_deleted FROM farms WHERE user_id = $1 AND updated_at > $2"
            )
            .bind(uid)
            .bind(since)
            .fetch_all(&state.db_pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, Farm>(
                "SELECT id, user_id, name, location, has_derogation, photo, updated_at, is_deleted FROM farms WHERE updated_at > $1"
            )
            .bind(since)
            .fetch_all(&state.db_pool)
            .await?
        }
    };

    let fields = match target_user_id {
        Some(uid) => {
            sqlx::query_as::<_, Field>(
                "SELECT f.id, f.farm_id, f.name, f.area_hectares, f.land_use, f.min_elevation, f.max_elevation, f.mean_elevation, f.average_slope, f.max_slope, ST_AsGeoJSON(f.geom) as geometry_geojson, f.updated_at, f.is_deleted FROM fields f JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND f.updated_at > $2"
            )
            .bind(uid)
            .bind(since)
            .fetch_all(&state.db_pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, Field>(
                "SELECT f.id, f.farm_id, f.name, f.area_hectares, f.land_use, f.min_elevation, f.max_elevation, f.mean_elevation, f.average_slope, f.max_slope, ST_AsGeoJSON(f.geom) as geometry_geojson, f.updated_at, f.is_deleted FROM fields f WHERE f.updated_at > $1"
            )
            .bind(since)
            .fetch_all(&state.db_pool)
            .await?
        }
    };

    let events = if is_admin {
        sqlx::query_as::<_, Event>(
            "SELECT e.id, e.field_id, e.event_type, e.description, e.date, e.updated_at, e.is_deleted, e.mapp_number, e.eppo_code, e.bbch_growth_stage FROM events e WHERE e.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, Event>(
            "SELECT e.id, e.field_id, e.event_type, e.description, e.date, e.updated_at, e.is_deleted, e.mapp_number, e.eppo_code, e.bbch_growth_stage FROM events e JOIN fields f ON e.field_id = f.id JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND e.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let farm_records = if is_admin {
        sqlx::query_as::<_, FarmRecord>(
            "SELECT fr.id, fr.farm_id, fr.agricultural_area, fr.manure_storage_capacity, fr.year, fr.has_derogation, fr.updated_at, fr.is_deleted FROM farm_records fr WHERE fr.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else if has_reports_module {
        sqlx::query_as::<_, FarmRecord>(
            "SELECT fr.id, fr.farm_id, fr.agricultural_area, fr.manure_storage_capacity, fr.year, fr.has_derogation, fr.updated_at, fr.is_deleted FROM farm_records fr JOIN farms fa ON fr.farm_id = fa.id WHERE fa.user_id = $1 AND fr.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        vec![]
    };

    let soil_analyses = if is_admin {
        sqlx::query_as::<_, SoilAnalysis>(
            "SELECT sa.id, sa.field_id, sa.sample_date, sa.ph_level, sa.phosphorus_index, sa.potassium_index, sa.magnesium_index, sa.updated_at, sa.is_deleted FROM soil_analyses sa WHERE sa.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else if has_reports_module {
        sqlx::query_as::<_, SoilAnalysis>(
            "SELECT sa.id, sa.field_id, sa.sample_date, sa.ph_level, sa.phosphorus_index, sa.potassium_index, sa.magnesium_index, sa.updated_at, sa.is_deleted FROM soil_analyses sa JOIN fields f ON sa.field_id = f.id JOIN farms fa ON f.farm_id = fa.id WHERE fa.user_id = $1 AND sa.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        vec![]
    };

    let fertilisation_plans = if is_admin {
        sqlx::query_as::<_, FertilisationPlan>(
            "SELECT fp.id, fp.field_id, fp.crop_type, fp.target_yield, fp.nitrogen_requirement, fp.phosphorus_requirement, fp.potassium_requirement, fp.application_date, fp.updated_at, fp.is_deleted FROM fertilisation_plans fp WHERE fp.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, FertilisationPlan>(
            "SELECT fp.id, fp.field_id, fp.crop_type, fp.target_yield, fp.nitrogen_requirement, fp.phosphorus_requirement, fp.potassium_requirement, fp.application_date, fp.updated_at, fp.is_deleted FROM fertilisation_plans fp JOIN fields f ON fp.field_id = f.id JOIN farms fa ON fp.field_id = fa.id WHERE fa.user_id = $1 AND fp.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let fertiliser_applications = if is_admin {
        sqlx::query_as::<_, FertiliserApplication>(
            "SELECT fa.id, fa.event_id, fa.fertiliser_type, fa.amount_applied, fa.nitrogen_content, fa.phosphorus_content, fa.is_protected_urea, fa.buffer_zone_confirmed, fa.evidence_of_control, fa.updated_at, fa.is_deleted FROM fertiliser_applications fa WHERE fa.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, FertiliserApplication>(
            "SELECT fa.id, fa.event_id, fa.fertiliser_type, fa.amount_applied, fa.nitrogen_content, fa.phosphorus_content, fa.is_protected_urea, fa.buffer_zone_confirmed, fa.evidence_of_control, fa.updated_at, fa.is_deleted FROM fertiliser_applications fa JOIN events e ON fa.event_id = e.id JOIN fields f ON e.field_id = f.id JOIN farms far ON f.farm_id = far.id WHERE far.user_id = $1 AND fa.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let organic_manure_applications = if is_admin {
        sqlx::query_as::<_, OrganicManureApplication>(
            "SELECT oma.id, oma.event_id, oma.manure_type, oma.volume_applied_m3_per_ha, oma.weight_applied_tonnes_per_ha, oma.nitrogen_content_kg_per_unit, oma.is_lesse_applied, oma.weather_conditions_confirmed, oma.buffer_zone_distance_meters, oma.updated_at, oma.is_deleted, oma.equipment_used, oma.lesse_exemption_reason FROM organic_manure_applications oma WHERE oma.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, OrganicManureApplication>(
            "SELECT oma.id, oma.event_id, oma.manure_type, oma.volume_applied_m3_per_ha, oma.weight_applied_tonnes_per_ha, oma.nitrogen_content_kg_per_unit, oma.is_lesse_applied, oma.weather_conditions_confirmed, oma.buffer_zone_distance_meters, oma.updated_at, oma.is_deleted, oma.equipment_used, oma.lesse_exemption_reason FROM organic_manure_applications oma JOIN events e ON oma.event_id = e.id JOIN fields f ON e.field_id = f.id JOIN farms far ON f.farm_id = far.id WHERE far.user_id = $1 AND oma.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let compliance_breaches = if is_admin {
        sqlx::query_as::<_, ComplianceBreach>(
            "SELECT cb.id, cb.farm_id, cb.breach_type, cb.severity, cb.estimated_penalty_percentage, cb.mandatory_training_required, cb.breach_date::TEXT, cb.notes, cb.is_repeat, cb.updated_at, cb.is_deleted FROM compliance_breaches cb WHERE cb.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, ComplianceBreach>(
            "SELECT cb.id, cb.farm_id, cb.breach_type, cb.severity, cb.estimated_penalty_percentage, cb.mandatory_training_required, cb.breach_date::TEXT, cb.notes, cb.is_repeat, cb.updated_at, cb.is_deleted FROM compliance_breaches cb JOIN farms fa ON cb.farm_id = fa.id WHERE fa.user_id = $1 AND cb.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let sward_movements = if is_admin {
        sqlx::query_as::<_, SwardMovement>(
            "SELECT sm.id, sm.farm_id, sm.movement_type, sm.quantity_m3, sm.date, sm.manure_type, sm.consignee_name, sm.consignee_address, sm.consignor_name, sm.consignor_address, sm.transporter_name, sm.contract_length_months, sm.updated_at, sm.is_deleted FROM sward_movements sm WHERE sm.updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, SwardMovement>(
            "SELECT sm.id, sm.farm_id, sm.movement_type, sm.quantity_m3, sm.date, sm.manure_type, sm.consignee_name, sm.consignee_address, sm.consignor_name, sm.consignor_address, sm.transporter_name, sm.contract_length_months, sm.updated_at, sm.is_deleted FROM sward_movements sm JOIN farms fa ON sm.farm_id = fa.id WHERE fa.user_id = $1 AND sm.updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    let checkpoint = Utc::now();

    let inventory_storage = if is_admin {
        sqlx::query_as::<_, InventoryStorage>(
            "SELECT id, uuid, tenant_id, farm_id, name, storage_type, capacity_volume::DOUBLE PRECISION as capacity_volume, current_volume::DOUBLE PRECISION as current_volume, is_covered, created_at, updated_at FROM inventory_storage WHERE updated_at > $1"
        )
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    } else {
        sqlx::query_as::<_, InventoryStorage>(
            "SELECT id, uuid, tenant_id, farm_id, name, storage_type, capacity_volume::DOUBLE PRECISION as capacity_volume, current_volume::DOUBLE PRECISION as current_volume, is_covered, created_at, updated_at FROM inventory_storage WHERE tenant_id = $1 AND updated_at > $2"
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&state.db_pool)
        .await?
    };

    Ok(Json(SyncResponse {
        checkpoint,
        farms,
        fields,
        events,
        farm_records,
        soil_analyses,
        fertilisation_plans,
        fertiliser_applications,
        organic_manure_applications,
        compliance_breaches,
        sward_movements,
        inventory_storage,
    }))
}
