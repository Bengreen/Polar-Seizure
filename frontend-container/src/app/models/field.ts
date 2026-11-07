export interface Field {
  id?: number;
  farm_id: number;
  name: string;
  area_hectares: number;
  land_use?: string;
  min_elevation?: number;
  max_elevation?: number;
  mean_elevation?: number;
  average_slope?: number;
  max_slope?: number;
  geometry_geojson?: string;
  updated_at?: string;
  is_deleted?: boolean;
  image_url?: string;
}
