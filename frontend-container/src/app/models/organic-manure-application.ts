export interface OrganicManureApplication {
  id?: number;
  event_id: number;
  manure_type: string;
  volume_applied_m3_per_ha?: number;
  weight_applied_tonnes_per_ha?: number;
  nitrogen_content_kg_per_unit?: number;
  is_lesse_applied?: boolean;
  weather_conditions_confirmed?: boolean;
  buffer_zone_distance_meters?: number;
  equipment_used?: string;
  lesse_exemption_reason?: string;
  updated_at?: string;
  is_deleted?: boolean;
}
