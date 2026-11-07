export interface SoilAnalysis {
  id?: number;
  field_id: number;
  sample_date: string;
  ph_level?: number;
  phosphorus_index?: number;
  potassium_index?: number;
  magnesium_index?: number;
}
