export interface Event {
  id?: number;
  field_id: number;
  event_type: string;
  description: string;
  date: string;
  updated_at?: string;
  is_deleted?: boolean;
  mapp_number?: string;
  eppo_code?: string;
  bbch_growth_stage?: string;
}
