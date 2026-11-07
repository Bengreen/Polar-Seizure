export interface ComplianceBreach {
  id: number;
  farm_id: number;
  breach_type: string;
  severity: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
  estimated_penalty_percentage?: number;
  mandatory_training_required?: string;
  breach_date: string;
  notes?: string;
  is_repeat?: boolean;
  updated_at?: string;
  is_deleted?: boolean;
}
