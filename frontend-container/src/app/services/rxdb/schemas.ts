/**
 * RxDB collection schemas for the sward-warden local-first database.
 *
 * Each schema mirrors the be PostgreSQL model, with additional
 * fields for offline sync tracking (syncStatus, updatedAt).
 */
import { RxJsonSchema } from 'rxdb';

/** Sync status for local records */
export type SyncStatus = 'synced' | 'pending' | 'failed';

/** Document types matching the RxDB schemas */
export interface InventoryStorageDocType {
  id: string; // Local uuid
  serverId?: number;
  uuid?: string;
  farm_id?: number | null;
  name: string;
  storage_type: string;
  capacity_volume: number;
  current_volume?: number | null;
  is_covered: boolean;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface FarmDocType {
  id: string;
  serverId?: number;
  user_id?: number;
  name: string;
  location: string;
  has_derogation?: boolean;
  photo?: string | null;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface FieldDocType {
  id: string;
  serverId?: number;
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
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface EventDocType {
  id: string;
  serverId?: number;
  field_id: number;
  event_type: string;
  description: string;
  date: string;
  mapp_number?: string;
  eppo_code?: string;
  bbch_growth_stage?: string;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface SoilAnalysisDocType {
  id: string;
  serverId?: number;
  field_id: number;
  sample_date: string;
  ph_level?: number;
  phosphorus_index?: number;
  potassium_index?: number;
  magnesium_index?: number;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface FertilisationPlanDocType {
  id: string;
  serverId?: number;
  field_id: number;
  crop_type: string;
  target_yield: number;
  nitrogen_requirement: number;
  phosphorus_requirement: number;
  potassium_requirement: number;
  application_date: string;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface FertiliserApplicationDocType {
  id: string;
  serverId?: number;
  event_id: number;
  fertiliser_type: string;
  amount_applied: number;
  nitrogen_content?: number;
  phosphorus_content?: number;
  is_protected_urea?: boolean;
  buffer_zone_confirmed?: boolean;
  evidence_of_control?: string;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface OrganicManureApplicationDocType {
  id: string;
  serverId?: number;
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
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface ComplianceBreachDocType {
  id: string;
  serverId?: number;
  farm_id: number;
  breach_type: string;
  severity: string;
  estimated_penalty_percentage?: number;
  mandatory_training_required?: string;
  breach_date: string;
  notes?: string;
  is_repeat?: boolean;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface SwardMovementDocType {
  id: string;
  serverId?: number;
  farm_id: number;
  movement_type: string;
  quantity_m3: number;
  date: string;
  manure_type: string;
  consignee_name?: string;
  consignee_address?: string;
  consignor_name?: string;
  consignor_address?: string;
  transporter_name?: string;
  contract_length_months?: number;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export const inventoryStorageSchema: RxJsonSchema<InventoryStorageDocType> = {
  title: 'inventory storage schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    serverId: { type: 'number' },
    uuid: { type: 'string' },
    farm_id: { type: ['number', 'null'] },
    name: { type: 'string' },
    storage_type: { type: 'string' },
    capacity_volume: { type: 'number' },
    current_volume: { type: ['number', 'null'] },
    is_covered: { type: 'boolean' },
    syncStatus: { type: 'string', default: 'synced' },
    updatedAt: { type: 'string' },
  },
  required: [
    'id',
    'name',
    'storage_type',
    'capacity_volume',
    'is_covered',
    'syncStatus',
    'updatedAt',
  ],
};

export const farmSchema: RxJsonSchema<FarmDocType> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    user_id: { type: 'number' },
    name: { type: 'string' },
    location: { type: 'string' },
    has_derogation: { type: 'boolean' },
    photo: { type: ['string', 'null'] },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: ['id', 'name', 'location', 'syncStatus', 'updatedAt'],
  indexes: ['syncStatus', 'updatedAt'],
};

export const fieldSchema: RxJsonSchema<FieldDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    farm_id: { type: 'number' },
    name: { type: 'string' },
    area_hectares: { type: 'number' },
    land_use: { type: 'string', default: 'grassland' },
    min_elevation: { type: 'number' },
    max_elevation: { type: 'number' },
    mean_elevation: { type: 'number' },
    average_slope: { type: 'number' },
    max_slope: { type: 'number' },
    geometry_geojson: { type: 'string' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'farm_id',
    'name',
    'area_hectares',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

export const eventSchema: RxJsonSchema<EventDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    field_id: { type: 'number' },
    event_type: { type: 'string' },
    description: { type: 'string' },
    date: { type: 'string' },
    mapp_number: { type: 'string' },
    eppo_code: { type: 'string' },
    bbch_growth_stage: { type: 'string' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'field_id',
    'event_type',
    'description',
    'date',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

export const soilAnalysisSchema: RxJsonSchema<SoilAnalysisDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    field_id: { type: 'number' },
    sample_date: { type: 'string' },
    ph_level: { type: 'number' },
    phosphorus_index: { type: 'number' },
    potassium_index: { type: 'number' },
    magnesium_index: { type: 'number' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: ['id', 'field_id', 'sample_date', 'syncStatus', 'updatedAt'],
  indexes: ['syncStatus', 'updatedAt'],
};

export const fertilisationPlanSchema: RxJsonSchema<FertilisationPlanDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    field_id: { type: 'number' },
    crop_type: { type: 'string' },
    target_yield: { type: 'number' },
    nitrogen_requirement: { type: 'number' },
    phosphorus_requirement: { type: 'number' },
    potassium_requirement: { type: 'number' },
    application_date: { type: 'string' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'field_id',
    'crop_type',
    'target_yield',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

export const fertiliserApplicationSchema: RxJsonSchema<FertiliserApplicationDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    event_id: { type: 'number' },
    fertiliser_type: { type: 'string' },
    amount_applied: { type: 'number' },
    nitrogen_content: { type: 'number' },
    phosphorus_content: { type: 'number' },
    is_protected_urea: { type: 'boolean' },
    buffer_zone_confirmed: { type: 'boolean' },
    evidence_of_control: { type: 'string' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['pending', 'synced', 'error'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: ['id', 'event_id', 'fertiliser_type', 'amount_applied', 'syncStatus', 'updatedAt'],
  indexes: ['syncStatus', 'updatedAt'],
};

export const organicManureApplicationSchema: RxJsonSchema<OrganicManureApplicationDocType> =
  {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: { type: 'string', maxLength: 64 },
      serverId: { type: 'number' },
      event_id: { type: 'number' },
      manure_type: { type: 'string' },
      volume_applied_m3_per_ha: { type: 'number' },
      weight_applied_tonnes_per_ha: { type: 'number' },
      nitrogen_content_kg_per_unit: { type: 'number' },
      is_lesse_applied: { type: 'boolean' },
      weather_conditions_confirmed: { type: 'boolean' },
      buffer_zone_distance_meters: { type: 'number' },
      equipment_used: { type: 'string' },
      lesse_exemption_reason: { type: 'string' },
      syncStatus: {
        type: 'string',
        maxLength: 16,
        enum: ['synced', 'pending', 'failed'],
        default: 'pending',
      },
      updatedAt: { type: 'string', maxLength: 32 },
    },
    required: ['id', 'event_id', 'manure_type', 'syncStatus', 'updatedAt'],
    indexes: ['syncStatus', 'updatedAt'],
  };

export const complianceBreachSchema: RxJsonSchema<ComplianceBreachDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    farm_id: { type: 'number' },
    breach_type: { type: 'string' },
    severity: { type: 'string' },
    estimated_penalty_percentage: { type: 'number' },
    mandatory_training_required: { type: 'string' },
    breach_date: { type: 'string' },
    notes: { type: 'string' },
    is_repeat: { type: 'boolean' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'farm_id',
    'breach_type',
    'severity',
    'breach_date',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

export const swardMovementSchema: RxJsonSchema<SwardMovementDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    farm_id: { type: 'number' },
    movement_type: { type: 'string', enum: ['import', 'export'] },
    quantity_m3: { type: 'number' },
    date: { type: 'string' },
    manure_type: { type: 'string' },
    consignee_name: { type: 'string' },
    consignee_address: { type: 'string' },
    consignor_name: { type: 'string' },
    consignor_address: { type: 'string' },
    transporter_name: { type: 'string' },
    contract_length_months: { type: 'number' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'farm_id',
    'movement_type',
    'quantity_m3',
    'date',
    'manure_type',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

export interface FarmRecordDocType {
  id: string;
  serverId?: number;
  farm_id: number;
  agricultural_area: number;
  manure_storage_capacity: number;
  year: number;
  has_derogation?: boolean;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export const farmRecordSchema: RxJsonSchema<FarmRecordDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: 'number' },
    farm_id: { type: 'number' },
    agricultural_area: { type: 'number' },
    manure_storage_capacity: { type: 'number' },
    year: { type: 'number' },
    has_derogation: { type: 'boolean' },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: [
    'id',
    'farm_id',
    'agricultural_area',
    'manure_storage_capacity',
    'year',
    'syncStatus',
    'updatedAt',
  ],
  indexes: ['syncStatus', 'updatedAt'],
};

/** Outbox entry for queuing offline writes. */
export type OutboxActionType = 'POST' | 'PUT' | 'DELETE';
export type OutboxEntityType =
  | 'farms'
  | 'fields'
  | 'events'
  | 'soil_analyses'
  | 'fertilisation_plans'
  | 'farm_records'
  | 'fertiliser_applications'
  | 'organic_manure_applications'
  | 'compliance_breaches'
  | 'sward_movements'
  | 'inventory_storage'
  | 'inventory_chemicals';
export type OutboxStatus = 'pending' | 'failed';

export interface OutboxDocType {
  id: string;
  actionType: OutboxActionType;
  entityType: OutboxEntityType;
  /** The local RxDB document id that this outbox entry relates to. */
  localDocId: string;
  /** JSON-serialised payload for the HTTP request body. */
  payload: string;
  timestamp: string;
  status: OutboxStatus;
  retryCount: number;
}

export const outboxSchema: RxJsonSchema<OutboxDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    actionType: {
      type: 'string',
      maxLength: 8,
      enum: ['POST', 'PUT', 'DELETE'],
    },
    entityType: {
      type: 'string',
      maxLength: 32,
      enum: [
        'farms',
        'fields',
        'events',
        'soil_analyses',
        'fertilisation_plans',
        'farm_records',
        'fertiliser_applications',
        'organic_manure_applications',
        'compliance_breaches',
        'sward_movements',
        'inventory_chemicals',
      ],
    },
    localDocId: { type: 'string', maxLength: 64 },
    payload: { type: 'string' },
    timestamp: { type: 'string', maxLength: 32 },
    status: {
      type: 'string',
      maxLength: 16,
      enum: ['pending', 'failed'],
      default: 'pending',
    },
    retryCount: { type: 'number', default: 0 },
  },
  required: [
    'id',
    'actionType',
    'entityType',
    'localDocId',
    'payload',
    'timestamp',
    'status',
    'retryCount',
  ],
  indexes: ['status', 'timestamp'],
};

/** Key-value metadata store (e.g., sync checkpoint). */
export interface MetadataDocType {
  key: string;
  value: string;
}

export const metadataSchema: RxJsonSchema<MetadataDocType> = {
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 64 },
    value: { type: 'string' },
  },
  required: ['key', 'value'],
};
export interface InventoryChemicalDocType {
  id: string;
  serverId?: number;
  user_id: number;
  farm_id?: number;
  name: string;
  mapp_number: string;
  active_ingredient?: string;
  quantity_on_hand?: number;
  unit?: string;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export const inventoryChemicalSchema: RxJsonSchema<InventoryChemicalDocType> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    serverId: { type: ['number', 'null'] },
    user_id: { type: 'number' },
    farm_id: { type: ['number', 'null'] },
    name: { type: 'string' },
    mapp_number: { type: 'string' },
    active_ingredient: { type: ['string', 'null'] },
    quantity_on_hand: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'] },
    syncStatus: {
      type: 'string',
      maxLength: 16,
      enum: ['synced', 'pending', 'failed'],
      default: 'pending',
    },
    updatedAt: { type: 'string', maxLength: 32 },
  },
  required: ['id', 'user_id', 'name', 'mapp_number', 'syncStatus', 'updatedAt'],
  indexes: ['syncStatus', 'updatedAt'],
};
