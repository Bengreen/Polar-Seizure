#[cfg(test)]
mod tests {
    use crate::data::rules::{ValidationResult, validate_organic_manure_application};
    use crate::models::{Event, Farm, Field, OrganicManureApplication};

    // References more than 3 PRDs
    fn get_test_farm() -> Farm {
        Farm {
            id: Some(1),
            user_id: Some(1),
            name: "Test Farm".to_string(),
            location: "Test Location".to_string(),
            has_derogation: Some(false),
            photo: None,
            updated_at: None,
            is_deleted: Some(false),
        }
    }

    // References more than 3 PRDs
    fn get_test_field() -> Field {
        Field {
            id: Some(1),
            farm_id: 1,
            name: "Test Field".to_string(),
            area_hectares: 10.0,
            land_use: Some("grassland".to_string()),
            min_elevation: None,
            max_elevation: None,
            mean_elevation: None,
            average_slope: None,
            max_slope: None,
            geometry_geojson: None,
            updated_at: None,
            image_url: None,
            is_deleted: Some(false),
        }
    }

    // PRD Reference: 0001
    #[test]
    fn test_validate_organic_manure_lesse_required_pig_slurry() {
        let farm = get_test_farm();
        let field = get_test_field();
        let event = Event {
            id: Some(1),
            field_id: 1,
            event_type: "Slurry Application".to_string(),
            description: "Test".to_string(),
            date: "2024-05-01".to_string(),
            updated_at: None,
            is_deleted: Some(false),
            mapp_number: None,
            eppo_code: None,
            bbch_growth_stage: None,
        };
        let app = OrganicManureApplication {
            id: None,
            event_id: 1,
            manure_type: "Pig Slurry".to_string(),
            volume_applied_m3_per_ha: Some(20.0),
            weight_applied_tonnes_per_ha: None,
            nitrogen_content_kg_per_unit: Some(5.0),
            is_lesse_applied: Some(false),
            weather_conditions_confirmed: Some(true),
            buffer_zone_distance_meters: Some(5),
            equipment_used: Some("Splash Plate".to_string()),
            lesse_exemption_reason: None,
            geometry_geojson: None,
            updated_at: None,
            is_deleted: Some(false),
        };

        let result =
            validate_organic_manure_application(&event, &app, &field, &farm, &[], 10.0, &[]);
        match result {
            ValidationResult::Invalid(reason) => assert!(reason.contains("LESSE) is required")),
            _ => panic!("Expected validation failure for missing pig slurry LESSE exemption"),
        }
    }

    // PRD Reference: 0001
    #[test]
    fn test_validate_organic_manure_lesse_exemption_valid() {
        let farm = get_test_farm();
        let field = get_test_field();
        let event = Event {
            id: Some(1),
            field_id: 1,
            event_type: "Slurry Application".to_string(),
            description: "Test".to_string(),
            date: "2024-05-01".to_string(),
            updated_at: None,
            is_deleted: Some(false),
            mapp_number: None,
            eppo_code: None,
            bbch_growth_stage: None,
        };
        let app = OrganicManureApplication {
            id: None,
            event_id: 1,
            manure_type: "Pig Slurry".to_string(),
            volume_applied_m3_per_ha: Some(20.0),
            weight_applied_tonnes_per_ha: None,
            nitrogen_content_kg_per_unit: Some(5.0),
            is_lesse_applied: Some(false),
            weather_conditions_confirmed: Some(true),
            buffer_zone_distance_meters: Some(5),
            equipment_used: Some("Splash Plate".to_string()),
            lesse_exemption_reason: Some("Field slope too steep for LESSE".to_string()),
            geometry_geojson: None,
            updated_at: None,
            is_deleted: Some(false),
        };

        let result =
            validate_organic_manure_application(&event, &app, &field, &farm, &[], 10.0, &[]);
        assert!(matches!(result, ValidationResult::Valid));
    }

    // PRD Reference: 0001
    #[test]
    fn test_validate_organic_manure_nitrogen_loading_exceeded() {
        let farm = get_test_farm();
        let field = get_test_field();
        let event = Event {
            id: Some(2),
            field_id: 1,
            event_type: "Slurry Application".to_string(),
            description: "Test".to_string(),
            date: "2024-05-01".to_string(),
            updated_at: None,
            is_deleted: Some(false),
            mapp_number: None,
            eppo_code: None,
            bbch_growth_stage: None,
        };
        let app = OrganicManureApplication {
            id: None,
            event_id: 2,
            manure_type: "Pig Slurry".to_string(),
            // 20 m3/ha * 5 kg N/unit = 100 kg N/ha. Total = 1000 kg N for this field
            volume_applied_m3_per_ha: Some(20.0),
            weight_applied_tonnes_per_ha: None,
            nitrogen_content_kg_per_unit: Some(5.0),
            is_lesse_applied: Some(true),
            weather_conditions_confirmed: Some(true),
            buffer_zone_distance_meters: Some(5),
            equipment_used: Some("Trailing Shoe".to_string()),
            lesse_exemption_reason: None,
            geometry_geojson: None,
            updated_at: None,
            is_deleted: Some(false),
        };

        // Create a previous application on another field that puts the farm close to the limit
        let prev_field = Field {
            id: Some(2),
            farm_id: 1,
            name: "Other Field".to_string(),
            area_hectares: 10.0,
            land_use: Some("grassland".to_string()),
            min_elevation: None,
            max_elevation: None,
            mean_elevation: None,
            average_slope: None,
            max_slope: None,
            geometry_geojson: None,
            updated_at: None,
            image_url: None,
            is_deleted: Some(false),
        };
        let prev_app = OrganicManureApplication {
            id: Some(1),
            event_id: 1,
            manure_type: "Pig Slurry".to_string(),
            // 30 m3/ha * 5 kg N/unit = 150 kg N/ha. Total = 1500 kg N.
            volume_applied_m3_per_ha: Some(30.0),
            weight_applied_tonnes_per_ha: None,
            nitrogen_content_kg_per_unit: Some(5.0),
            is_lesse_applied: Some(true),
            weather_conditions_confirmed: Some(true),
            buffer_zone_distance_meters: Some(5),
            equipment_used: Some("Trailing Shoe".to_string()),
            lesse_exemption_reason: None,
            geometry_geojson: None,
            updated_at: None,
            is_deleted: Some(false),
        };

        // Farm total area is 20 ha (10 + 10). Limit is 170 * 20 = 3400 kg N
        // Total N = 1000 + 1500 = 2500 kg N. (2500 / 20 = 125 kg N/ha, so it should pass)
        let result_pass = validate_organic_manure_application(
            &event,
            &app,
            &field,
            &farm,
            &[],
            20.0,
            &[(prev_app.clone(), prev_field.clone())],
        );
        assert!(matches!(result_pass, ValidationResult::Valid));

        // Now let's try an application that pushes it over the limit
        let huge_app = OrganicManureApplication {
            volume_applied_m3_per_ha: Some(40.0), // Need to stay <= 50 to pass that rule. 40 * 10 kg N/unit = 400 kg N/ha.
            nitrogen_content_kg_per_unit: Some(10.0), // 400 kg N/ha * 10 ha = 4000 kg N total for this field. Grand total = 4000 + 1500 = 5500 kg N (275 kg N/ha average -> exceeds 170 and 250)
            ..app
        };

        let result_fail = validate_organic_manure_application(
            &event,
            &huge_app,
            &field,
            &farm,
            &[],
            20.0,
            &[(prev_app, prev_field)],
        );
        match result_fail {
            ValidationResult::Invalid(reason) => {
                if !reason.contains("exceeds farm-wide Nitrogen loading limit") {
                    panic!("Validation failed but for wrong reason: {}", reason);
                }
            }
            _ => panic!("Expected validation failure for exceeding farm-wide N loading"),
        }
    }

    // PRD Reference: 0001
    #[test]
    fn test_validate_organic_manure_lesse_required_2026() {
        let farm = get_test_farm();
        let field = get_test_field();
        let event = Event {
            id: Some(1),
            field_id: 1,
            event_type: "Slurry Application".to_string(),
            description: "Test".to_string(),
            date: "2026-05-01".to_string(),
            updated_at: None,
            is_deleted: Some(false),
            mapp_number: None,
            eppo_code: None,
            bbch_growth_stage: None,
        };
        let app = OrganicManureApplication {
            id: None,
            event_id: 1,
            manure_type: "Cattle Slurry".to_string(),
            volume_applied_m3_per_ha: Some(20.0),
            weight_applied_tonnes_per_ha: None,
            nitrogen_content_kg_per_unit: Some(5.0),
            is_lesse_applied: Some(false),
            weather_conditions_confirmed: Some(true),
            buffer_zone_distance_meters: Some(5),
            equipment_used: Some("Splash Plate".to_string()),
            lesse_exemption_reason: None,
            geometry_geojson: None,
            updated_at: None,
            is_deleted: Some(false),
        };

        let result =
            validate_organic_manure_application(&event, &app, &field, &farm, &[], 10.0, &[]);
        match result {
            ValidationResult::Invalid(reason) => assert!(reason.contains("LESSE) is required")),
            _ => panic!(
                "Expected validation failure for cattle slurry in 2026 without LESSE/exemption"
            ),
        }
    }
}
