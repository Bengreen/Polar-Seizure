export interface FertilisationPlan {
  id?: number;
  field_id: number;
  crop_type: string;
  target_yield: number;
  nitrogen_requirement: number;
  phosphorus_requirement: number;
  potassium_requirement: number;
  application_date: string;
}
