export interface FertiliserApplication {
  id?: number | string;
  localId?: string;
  serverId?: number;
  event_id: number;
  fertiliser_type: string;
  amount_applied: number;
  nitrogen_content?: number;
  phosphorus_content?: number;
  is_protected_urea?: boolean;
  buffer_zone_confirmed?: boolean;
  evidence_of_control?: string;
  updated_at?: string;
  is_deleted?: boolean;
}
