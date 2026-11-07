export interface SwardMovement {
  id?: number;
  farm_id: number;
  movement_type: 'import' | 'export';
  quantity_m3: number;
  date: string;
  manure_type: string;
  consignee_name?: string;
  consignee_address?: string;
  consignor_name?: string;
  consignor_address?: string;
  transporter_name?: string;
  contract_length_months?: number;
  updated_at?: string;
  is_deleted?: boolean;
}
