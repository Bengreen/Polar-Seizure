//! Compliance and validation rules for agricultural event records.
//!
//! Enforces environmental regulations, closed spreading periods, buffer zones, and N/P limit checks.

use crate::models::{Event, Farm, FertiliserApplication, Field, OrganicManureApplication};
use chrono::{Datelike, NaiveDate, Utc};

/// Result of a compliance rule validation check.
pub enum ValidationResult {
    /// Validation passed with no breaches.
    Valid,
    /// Validation failed with a description of the compliance violation.
    Invalid(String),
}

/// Validates chemical fertiliser application rules against environmental regulation constraints.
// References more than 3 PRDs
pub fn validate_fertiliser_application(
    event: &Event,
    app: &FertiliserApplication,
    field: &Field,
) -> ValidationResult {
    let date = NaiveDate::parse_from_str(&event.date, "%Y-%m-%d")
        .unwrap_or_else(|_| NaiveDate::from_ymd_opt(2000, 1, 1).unwrap_or(NaiveDate::MIN));
    let month = date.month();
    let day = date.day();

    // 1. Closed Spreading Periods Rule
    // Grassland: 15 Sept to 31 Jan (Prohibited for Chemical N/P)
    let land_use = field.land_use.as_deref().unwrap_or("grassland");
    if land_use == "grassland" {
        let is_prohibited = (month == 9 && day >= 15) || month > 9 || month == 1;
        if is_prohibited
            && (app.nitrogen_content.unwrap_or(0.0) > 0.0
                || app.phosphorus_content.unwrap_or(0.0) > 0.0)
        {
            return ValidationResult::Invalid("Chemical N/P fertiliser application is prohibited on grassland between 15 Sept and 31 Jan.".to_string());
        }
    }

    // 2. Urea Limits
    // No granular urea without inhibitors after 1 Jan 2026
    if date.year() >= 2026
        && app.fertiliser_type.to_lowercase().contains("urea")
        && !app.is_protected_urea.unwrap_or(false)
    {
        return ValidationResult::Invalid(
            "Granular urea without inhibitors is prohibited after 1 Jan 2026.".to_string(),
        );
    }

    // 3. Buffer Zones
    if !app.buffer_zone_confirmed.unwrap_or(false) {
        return ValidationResult::Invalid(
            "You must confirm a 2-meter buffer zone from waterways.".to_string(),
        );
    }

    ValidationResult::Valid
}

// References more than 3 PRDs
pub fn validate_organic_manure_application(
    event: &Event,
    app: &OrganicManureApplication,
    field: &Field,
    farm: &Farm,
    previous_apps: &[Event], // Used for 3-week gap rule
    farm_agricultural_area: f64,
    farm_year_manure_apps: &[(OrganicManureApplication, Field)], // All apps for the farm in the current calendar year
) -> ValidationResult {
    let date = NaiveDate::parse_from_str(&event.date, "%Y-%m-%d")
        .unwrap_or_else(|_| Utc::now().date_naive());
    let month = date.month();
    let day = date.day();

    // 1. Closed Spreading Periods
    let m_type = app.manure_type.to_lowercase();
    if m_type.contains("sward") || m_type.contains("poultry") || m_type.contains("digestate") {
        let is_prohibited = (month == 10 && day >= 15) || month > 10 || month == 1;
        if is_prohibited {
            return ValidationResult::Invalid(format!(
                "{} application is prohibited between 15 Oct and 31 Jan.",
                app.manure_type
            ));
        }
    } else if m_type.contains("fym") || m_type.contains("farmyard") {
        let is_prohibited = month > 10 || month == 1;
        if is_prohibited {
            return ValidationResult::Invalid(
                "Farmyard Manure (FYM) application is prohibited between 31 Oct and 31 Jan."
                    .to_string(),
            );
        }
    }

    // 2. Weather Conditions
    if !app.weather_conditions_confirmed.unwrap_or(false) {
        return ValidationResult::Invalid(
            "You must confirm that soil is not waterlogged, flooded, frozen, or snow-covered."
                .to_string(),
        );
    }

    // 3. Volume Limits
    if let Some(vol) = app.volume_applied_m3_per_ha
        && vol > 50.0
    {
        return ValidationResult::Invalid(
            "Maximum application volume is 50m³ per hectare.".to_string(),
        );
    }
    if let Some(weight) = app.weight_applied_tonnes_per_ha
        && weight > 50.0
    {
        return ValidationResult::Invalid(
            "Maximum application weight is 50 tonnes per hectare.".to_string(),
        );
    }

    // 4. Three-week Gap
    for prev in previous_apps {
        if let Ok(prev_date) = NaiveDate::parse_from_str(&prev.date, "%Y-%m-%d") {
            let diff = date.signed_duration_since(prev_date).num_days();
            if diff.abs() < 21 {
                return ValidationResult::Invalid(
                    "A minimum three-week gap is required between applications on the same land."
                        .to_string(),
                );
            }
        }
    }

    // 5. Nitrogen Loading
    // Calculate cumulative N loading across the entire farm for the calendar year
    if farm_agricultural_area > 0.0 {
        let limit = if farm.has_derogation.unwrap_or(false) {
            250.0
        } else {
            170.0
        };

        // Helper to calculate total N applied in kg for a given application and field
        let calculate_total_n_kg =
            |manure_app: &OrganicManureApplication, app_field: &Field| -> f64 {
                if let Some(n_content) = manure_app.nitrogen_content_kg_per_unit {
                    if let Some(vol) = manure_app.volume_applied_m3_per_ha {
                        vol * n_content * app_field.area_hectares
                    } else if let Some(weight) = manure_app.weight_applied_tonnes_per_ha {
                        weight * n_content * app_field.area_hectares
                    } else {
                        0.0
                    }
                } else {
                    0.0
                }
            };

        // Sum N from all previous applications in the year
        let mut total_n_kg_year = 0.0;
        for (prev_app, prev_field) in farm_year_manure_apps {
            // Only count if it's not the same application we're currently processing
            if let Some(id) = prev_app.id {
                if app.id != Some(id) {
                    total_n_kg_year += calculate_total_n_kg(prev_app, prev_field);
                }
            } else {
                total_n_kg_year += calculate_total_n_kg(prev_app, prev_field);
            }
        }

        // Add the current application
        total_n_kg_year += calculate_total_n_kg(app, field);

        let cumulative_n_per_ha = total_n_kg_year / farm_agricultural_area;

        if cumulative_n_per_ha > limit {
            return ValidationResult::Invalid(format!(
                "Application exceeds farm-wide Nitrogen loading limit. With this application, the farm average would be {:.1} kg N/ha/year, which exceeds the limit of {} kg N/ha/year.",
                cumulative_n_per_ha, limit
            ));
        }
    }

    // 6. LESSE (Low Emission Slurry Spreading Equipment) Rules
    let is_slurry = m_type.contains("slurry") || m_type.contains("digestate");
    if is_slurry {
        // From 1 Jan 2026, all slurry must be applied by LESSE
        // Pig slurry must always be applied by LESSE
        let requires_lesse = date.year() >= 2026 || m_type.contains("pig");

        if requires_lesse
            && !app.is_lesse_applied.unwrap_or(false)
            && app
                .lesse_exemption_reason
                .as_ref()
                .map_or(true, |r| r.is_empty())
        {
            return ValidationResult::Invalid(
                    "Low Emission Slurry Spreading Equipment (LESSE) is required. If LESSE cannot be used, a valid exemption reason must be provided.".to_string(),
                );
        }
    }

    ValidationResult::Valid
}
