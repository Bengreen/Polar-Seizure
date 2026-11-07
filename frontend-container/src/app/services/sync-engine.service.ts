import { Injectable, OnDestroy, Optional } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  Subscription,
  firstValueFrom,
  filter,
  switchMap,
  from,
  timer,
  merge,
  debounceTime,
  catchError,
  of,
} from 'rxjs';
import { RxdbService, SwardDatabase } from './rxdb/rxdb.service';
import { InventoryChemicalDocType } from './rxdb/schemas';
import { NetworkService } from './network.service';
import { SyncStateService } from './sync-state.service';
import { AuthService } from './auth.service';
import { generateLocalId } from '../utils/local-id';
import { LoggerService } from './logger.service';
import { FarmManagementService } from './farm-management.service';
import { OutboxDocType } from './rxdb/schemas';

/** Maximum retry attempts before marking an outbox entry as permanently failed. */
const MAX_RETRIES = 5;

/** Periodic sync interval in milliseconds (default: 5 minutes). */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Metadata key used to store the last successful sync checkpoint. */
const CHECKPOINT_KEY = 'lastSyncCheckpoint';

/** Response shape from the be delta sync endpoint. */
interface SyncResponse {
  checkpoint: string;
  farms: any[];
  fields: any[];
  events: any[];
  farm_records: any[];
  soil_analyses: any[];
  fertilisation_plans: any[];
  fertiliser_applications: any[];
  organic_manure_applications: any[];
  compliance_breaches: any[];
  sward_movements: any[];
  inventory_storage?: any[];
}

/**
 * Service responsible for bi-directional sync:
 * - Push: process the outbox queue (offline writes → be)
 * - Pull: fetch delta changes from be → local RxDB
 *
 * Sync is triggered on:
 * - Application startup (if online)
 * - Network transitions from offline → online
 * - Periodic timer (every 5 minutes while online)
 */
@Injectable({
  providedIn: 'root',
})
export class SyncEngineService implements OnDestroy {
  private subscription: Subscription;
  private syncInProgress = false;
  private syncNeededAgain = false;

  constructor(
    private rxdbService: RxdbService,
    private networkService: NetworkService,
    private syncStateService: SyncStateService,
    private farmService: FarmManagementService,
    private authService: AuthService,
    private logger: LoggerService,
    private http: HttpClient,
    @Optional() private router?: Router,
  ) {
    // Load initial lastSyncTime from RxDB
    this.rxdbService.db$.subscribe(async (db) => {
      if (db) {
        const doc = await (db as any).metadata.findOne('lastSyncTime').exec();
        if (doc && doc.value) {
          this.syncStateService.setLastSyncTime(new Date(doc.value));
        }
      }
    });

    // Sync triggers: online events + periodic timer + pending outbox inserts
    const onlineEvent$ = this.networkService.isOnline$.pipe(
      // PRD Reference: 0001
      filter((online) => online),
    );

    const periodicSync$ = timer(0, SYNC_INTERVAL_MS).pipe(
      // PRD Reference: 0001
      switchMap(() => this.networkService.isOnline$),
      // PRD Reference: 0001
      filter((online) => online),
    );

    const outboxTrigger$ = this.rxdbService.db$.pipe(
      // PRD Reference: 0001
      catchError(() => of(null)), // avoid app crash on db init failure
      // PRD Reference: 0001
      filter((db) => db !== null),
      // PRD Reference: 0001
      switchMap((db) => db!.outbox.find({ selector: { status: 'pending' } }).$),
      // PRD Reference: 0001
      filter((entries) => entries.length > 0),
      // PRD Reference: 0001
      debounceTime(500),
      // PRD Reference: 0001
      switchMap(() => this.networkService.isOnline$),
      // PRD Reference: 0001
      filter((online) => online),
    );

    this.subscription = merge(onlineEvent$, periodicSync$, outboxTrigger$)
      .pipe(
        // PRD Reference: 0001
        filter(() => !this.rxdbService.fallbackToRest$.value),
        // PRD Reference: 0001
        switchMap(() => from(this.fullSync())),
      )
      .subscribe();
  }

  /**
   * Perform a full sync cycle:
   * 1. Push: flush the outbox queue
   * 2. Pull: fetch delta changes from the be
   */
  // PRD Reference: 0001, 0002
  async fullSync(): Promise<void> {
    if (this.syncInProgress || this.rxdbService.fallbackToRest$.value) {
      this.syncNeededAgain = true;
      return;
    }
    this.syncInProgress = true;

    try {
      while (true) {
        this.syncNeededAgain = false;
        await this.processOutbox();
        await this.pullSync();
        if (!this.syncNeededAgain) {
          break;
        }
      }
    } catch (error: any) {
      this.logger.error('SYNC ENGINE: Sync failed with error:', error);
      if (error && (error.status === 403 || error.status === 401)) {
        this.handleSyncError(error);
      } else {
        throw error;
      }
    } finally {
      this.syncInProgress = false;
      this.syncNeededAgain = false;
    }
  }

  /** Handle sync errors by navigating to /error with diagnostic state and user profile */
  // PRD Reference: 0001, 0002
  private handleSyncError(error: any): void {
    const currentUrl = this.router ? this.router.url : '/home';
    const previousUrl = currentUrl && currentUrl !== '/error' ? currentUrl : '/home';
    const status = error.status || 403;
    const message =
      error.error?.error ||
      error.message ||
      'Synchronization forbidden. Please verify permissions or user identity.';

    if (this.router) {
      this.router.navigate(['/error'], {
        state: {
          error: message,
          errorCode: status,
          isSyncError: true,
          previousUrl,
        },
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Push Sync (Outbox Processing)
  // ──────────────────────────────────────────────────────────

  /** Process all pending outbox entries in chronological order. */
  // PRD Reference: 0001
  async processOutbox(): Promise<void> {
    if (this.rxdbService.fallbackToRest$.value) return;

    const db = await firstValueFrom(this.rxdbService.db$);
    const pendingEntries = await db.outbox
      .find({
        selector: { status: 'pending' },
        sort: [{ timestamp: 'asc' }],
      })
      .exec();

    if (pendingEntries.length === 0) {
      return;
    }
    this.logger.log(
      'SYNC ENGINE: Found pending entries:',
      pendingEntries.map((e) => ({
        id: e.id,
        action: e.actionType,
        entity: e.entityType,
        payload: e.payload,
      })),
    );

    const now = Date.now();
    let hasValidEntries = false;

    // Filter out entries still in backoff
    const entriesToProcess = pendingEntries.filter((entry) => {
      if (entry.retryCount > 0) {
        const lastAttemptTime = new Date(entry.timestamp).getTime();
        const backoffMs = Math.pow(2, entry.retryCount - 1) * 30 * 1000; // 30s, 60s, 120s...
        if (now - lastAttemptTime < backoffMs) {
          return false;
        }
      }
      hasValidEntries = true;
      return true;
    });

    if (!hasValidEntries || entriesToProcess.length === 0) {
      return;
    }

    this.syncStateService.setSyncing();

    const apiUrl = await firstValueFrom(this.farmService.apiUrl$);
    const headers = this.farmService.getHeaders();

    for (const entry of entriesToProcess) {
      try {
        await this.processEntry(entry, apiUrl, headers, db);
        await entry.remove();
      } catch (error: any) {
        this.logger.error(
          `SYNC ENGINE: Error processing entry ${entry.id}:`,
          error,
        );
        if (error && (error.status === 403 || error.status === 401)) {
          throw error;
        }
        const newRetryCount = (entry.retryCount || 0) + 1;
        const isClientError =
          error && (error.status === 400 || error.status === 422);

        if (isClientError || newRetryCount >= MAX_RETRIES) {
          await entry.patch({
            status: 'failed',
            retryCount: newRetryCount,
            timestamp: new Date().toISOString(),
          });
          await this.updateLocalDocStatus(
            db,
            entry.entityType,
            entry.localDocId,
            'failed',
          );
        } else {
          await entry.patch({
            retryCount: newRetryCount,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    this.syncStateService.setSynced();
  }

  /** Resolve local IDs (starting with '-') to server IDs in outbox payloads before sending. */
  private async resolvePayloadReferences(
    payload: any,
    entityType: string,
    db: SwardDatabase,
  ): Promise<any> {
    const resolved = { ...payload };

    const resolveField = async (val: any, collection: any): Promise<any> => {
      const valStr = val !== undefined && val !== null ? val.toString() : '';
      if (valStr.startsWith('-')) {
        const doc = await collection
          .findOne({ selector: { id: valStr } })
          .exec();
        if (doc && doc.serverId !== undefined) {
          return doc.serverId;
        }
      }
      return val;
    };

    if (resolved.farm_id !== undefined && (db as any).farms) {
      resolved.farm_id = await resolveField(
        resolved.farm_id,
        (db as any).farms,
      );
    }
    if (resolved.field_id !== undefined && (db as any).fields) {
      resolved.field_id = await resolveField(
        resolved.field_id,
        (db as any).fields,
      );
    }
    if (resolved.event_id !== undefined && (db as any).events) {
      resolved.event_id = await resolveField(
        resolved.event_id,
        (db as any).events,
      );
    }
    if (resolved.storage_id !== undefined && (db as any).inventory_storage) {
      resolved.storage_id = await resolveField(
        resolved.storage_id,
        (db as any).inventory_storage,
      );
    }
    if (resolved.id !== undefined) {
      const collection = (db as any)[entityType];
      if (collection) {
        resolved.id = await resolveField(resolved.id, collection);
      }
    }

    return resolved;
  }

  /** Execute the HTTP request for a single outbox entry. */
  private async processEntry(
    entry: any,
    apiUrl: string,
    headers: HttpHeaders,
    db: SwardDatabase,
  ): Promise<void> {
    const rawPayload = JSON.parse(entry.payload);
    const payload = await this.resolvePayloadReferences(
      rawPayload,
      entry.entityType,
      db,
    );
    this.logger.log(
      `SYNC ENGINE: processEntry action=${entry.actionType} entity=${entry.entityType} payload:`,
      payload,
    );

    const endpointMap: Record<string, string> = {
      compliance_breaches: 'compliance-breaches',
      sward_movements: 'sward-movements',
      inventory_storage: 'inventory-storage',
    };
    const endpoint = endpointMap[entry.entityType] || entry.entityType;

    switch (entry.actionType) {
      case 'POST': {
        this.logger.log(`SYNC ENGINE: Sending POST to ${apiUrl}/${endpoint}`);
        const response = await firstValueFrom(
          this.http.post<any>(`${apiUrl}/${endpoint}`, payload, { headers }),
        );
        this.logger.log(`SYNC ENGINE: POST response:`, response);
        if (response?.id) {
          await this.updateLocalDocServerId(
            db,
            entry.entityType,
            entry.localDocId,
            response.id,
          );
        }
        break;
      }
      case 'DELETE': {
        const serverId = payload.id;
        this.logger.log(
          `SYNC ENGINE: Sending DELETE to ${apiUrl}/${endpoint}/${serverId}`,
        );
        if (serverId) {
          await firstValueFrom(
            this.http.delete(`${apiUrl}/${endpoint}/${serverId}`, { headers }),
          );
          this.logger.log(`SYNC ENGINE: DELETE successful`);
        } else {
          this.logger.warn(`SYNC ENGINE: DELETE skipped, no serverId`);
        }
        break;
      }
      case 'PUT': {
        const serverId = payload.id;
        this.logger.log(
          `SYNC ENGINE: Sending PUT to ${apiUrl}/${endpoint}/${serverId}`,
        );
        if (serverId) {
          await firstValueFrom(
            this.http.put(`${apiUrl}/${endpoint}/${serverId}`, payload, {
              headers,
            }),
          );
          this.logger.log(`SYNC ENGINE: PUT successful`);
        } else {
          this.logger.warn(`SYNC ENGINE: PUT skipped, no serverId`);
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Pull Sync (Delta Fetch)
  // ──────────────────────────────────────────────────────────

  /** Fetch changed records from the be and upsert into local RxDB. */
  // PRD Reference: 0001
  async pullSync(): Promise<void> {
    if (this.rxdbService.fallbackToRest$.value) return;
    const db = await firstValueFrom(this.rxdbService.db$);
    const apiUrl = await firstValueFrom(this.farmService.apiUrl$);
    const headers = this.farmService.getHeaders();
    const currentUserId = this.authService.getUserId() || '';

    // Check if the user changed in between
    const lastSyncUserId = await this.getLastSyncUserId(db);
    let checkpoint = await this.getCheckpoint(db);

    if (lastSyncUserId && lastSyncUserId !== currentUserId) {
      this.logger.warn(
        `SYNC ENGINE: User changed from ${lastSyncUserId} to ${currentUserId}. Invaliding checkpoint and performing full refresh.`,
      );
      await this.clearCheckpoint(db);
      await this.clearAllCollections(db);
      checkpoint = null;
    }

    // Build the sync URL
    let syncUrl = `${apiUrl}/sync`;
    if (checkpoint) {
      syncUrl += `?since=${encodeURIComponent(checkpoint)}`;
    }

    this.syncStateService.setSyncing();

    try {
      const response = await firstValueFrom(
        this.http.get<SyncResponse>(syncUrl, { headers }),
      );

      // Process each entity type
      await this.upsertFarms(db, response.farms || []);
      await this.upsertFields(db, response.fields || []);
      await this.upsertEvents(db, response.events || []);
      await this.upsertSoilAnalyses(db, response.soil_analyses || []);
      await this.upsertFertilisationPlans(
        db,
        response.fertilisation_plans || [],
      );
      await this.upsertFarmRecords(db, response.farm_records || []);
      await this.upsertFertiliserApplications(
        db,
        response.fertiliser_applications || [],
      );
      await this.upsertOrganicManureApplications(
        db,
        response.organic_manure_applications || [],
      );
      await this.upsertComplianceBreaches(
        db,
        response.compliance_breaches || [],
      );
      await this.upsertSwardMovements(db, response.sward_movements || []);
      await this.upsertInventoryStorage(db, response.inventory_storage || []);

      // Update checkpoint and last sync user ID
      if (response.checkpoint) {
        await this.setCheckpoint(db, response.checkpoint, currentUserId);
      }
    } finally {
      this.syncStateService.setSynced();
    }
  }

  // ──────────────────────────────────────────────────────────
  // Checkpoint Management
  // ──────────────────────────────────────────────────────────

  /** Get the last sync checkpoint from the metadata collection. */
  // PRD Reference: 0001
  async getCheckpoint(db: SwardDatabase): Promise<string | null> {
    const doc = await (db as any).metadata.findOne(CHECKPOINT_KEY).exec();
    return doc?.value ?? null;
  }

  /** Get the user ID associated with the last successful sync. */
  // PRD Reference: 0001
  async getLastSyncUserId(db: SwardDatabase): Promise<string | null> {
    const doc = await (db as any).metadata.findOne('lastSyncUserId').exec();
    return doc?.value ?? null;
  }

  /** Set the sync checkpoint and user ID in the metadata collection. */
  // PRD Reference: 0001
  async setCheckpoint(
    db: SwardDatabase,
    checkpoint: string,
    userId: string = '',
  ): Promise<void> {
    // PRD Reference: 0001
    await (db as any).metadata.upsert({
      key: CHECKPOINT_KEY,
      value: checkpoint,
    });
    // PRD Reference: 0001
    await (db as any).metadata.upsert({
      key: 'lastSyncUserId',
      value: userId,
    });

    // Update last sync time
    const now = new Date();
    await (db as any).metadata.upsert({
      key: 'lastSyncTime',
      value: now.toISOString(),
    });
    this.syncStateService.setLastSyncTime(now);
  }

  /** Clear the sync checkpoint in the metadata collection to force a full fetch. */
  // PRD Reference: 0001
  async clearCheckpoint(db: SwardDatabase): Promise<void> {
    const doc = await (db as any).metadata.findOne(CHECKPOINT_KEY).exec();
    if (doc) {
      await doc.remove();
    }
    const userDoc = await (db as any).metadata.findOne('lastSyncUserId').exec();
    if (userDoc) {
      await userDoc.remove();
    }
  }

  /** Clear all local data collections (farms, fields, etc.) to prepare for a different user's sync. */
  // PRD Reference: 0001
  async clearAllCollections(db: SwardDatabase): Promise<void> {
    const collections = [
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
      'outbox',
    ];
    await Promise.all(
      collections.map(async (name) => {
        const col = (db as any)[name];
        if (col) {
          const docs = await col.find().exec();
          if (docs && docs.length > 0) {
            await col.bulkRemove(docs.map((d: any) => d.id));
          }
        }
      }),
    );
  }

  /** Force a sync by clearing the checkpoint and pulling all data from the server. */
  // PRD Reference: 0001
  async forcePullSync(): Promise<void> {
    if (this.syncInProgress || this.rxdbService.fallbackToRest$.value) {
      this.syncNeededAgain = true;
      return;
    }

    this.syncInProgress = true;
    try {
      const db = await firstValueFrom(this.rxdbService.db$);
      const currentUserId = this.authService.getUserId() || '';
      const lastSyncUserId = await this.getLastSyncUserId(db);
      if (lastSyncUserId && lastSyncUserId !== currentUserId) {
        this.logger.warn(
          `SYNC ENGINE (Force): User changed from ${lastSyncUserId} to ${currentUserId}. Invaliding checkpoint and performing full refresh.`,
        );
        await this.clearCheckpoint(db);
        await this.clearAllCollections(db);
      }
      await this.clearCheckpoint(db);
      await this.pullSync();
    } finally {
      this.syncInProgress = false;
      this.syncNeededAgain = false;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Upsert Logic with LWW Conflict Resolution (Optimized)
  // ──────────────────────────────────────────────────────────

  /** Upsert farms from the server into local RxDB. */
  private async upsertFarms(
    db: SwardDatabase,
    serverFarms: any[],
  ): Promise<void> {
    if (serverFarms.length === 0) return;

    const serverIds = serverFarms.map((f) => f.id);
    const existingDocs = await db.farms
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const localDocsByServerId = new Map<number, any[]>();
    for (const doc of existingDocs) {
      if (doc.serverId !== undefined) {
        const list = localDocsByServerId.get(doc.serverId) || [];
        list.push(doc);
        localDocsByServerId.set(doc.serverId, list);
      }
    }

    const potentialConflictDocIds = serverFarms
      .map((sf) => {
        const localDocs = localDocsByServerId.get(sf.id);
        if (!localDocs || localDocs.length === 0 || sf.is_deleted) return null;
        const localDoc = localDocs[0];
        const serverTime = new Date(sf.updated_at).getTime();
        const localTime = new Date(localDoc.updatedAt).getTime();
        return localTime > serverTime ? localDoc.id : null;
      })
      .filter((id): id is string => id !== null);

    const pendingOutboxSet = new Set<string>();
    if (potentialConflictDocIds.length > 0) {
      const pendingEntries = await db.outbox
        .find({
          selector: {
            localDocId: { $in: potentialConflictDocIds },
            status: 'pending',
          },
        })
        .exec();
      pendingEntries.forEach((e) => pendingOutboxSet.add(e.localDocId));
    }

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const serverFarm of serverFarms) {
      const localDocs = localDocsByServerId.get(serverFarm.id) || [];
      if (serverFarm.is_deleted) {
        for (const doc of localDocs) idsToRemove.push(doc.id);
        continue;
      }

      if (localDocs.length > 0) {
        const localDoc = localDocs[0];
        const hasPending = pendingOutboxSet.has(localDoc.id);
        if (
          this.shouldOverwriteLocal(
            localDoc.updatedAt,
            serverFarm.updated_at,
            hasPending,
          )
        ) {
          toUpsert.push({
            ...localDoc.toJSON(),
            name: serverFarm.name,
            location: serverFarm.location,
            has_derogation: serverFarm.has_derogation,
            updatedAt: serverFarm.updated_at,
            syncStatus: 'synced' as any,
          });
        }
      } else {
        toUpsert.push({
          id: `server-${serverFarm.id}`,
          serverId: serverFarm.id,
          user_id: serverFarm.user_id,
          name: serverFarm.name,
          location: serverFarm.location,
          has_derogation: serverFarm.has_derogation,
          syncStatus: 'synced' as any,
          updatedAt: serverFarm.updated_at,
        });
      }
    }

    if (idsToRemove.length > 0) await db.farms.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.farms.bulkUpsert(toUpsert);
  }

  /** Upsert fields from the server into local RxDB. */
  private async upsertFields(
    db: SwardDatabase,
    serverFields: any[],
  ): Promise<void> {
    if (serverFields.length === 0) return;

    const serverIds = serverFields.map((f) => f.id);
    const existingDocs = await db.fields
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const localDocsByServerId = new Map<number, any[]>();
    for (const doc of existingDocs) {
      if (doc.serverId !== undefined) {
        const list = localDocsByServerId.get(doc.serverId) || [];
        list.push(doc);
        localDocsByServerId.set(doc.serverId, list);
      }
    }

    const potentialConflictDocIds = serverFields
      .map((sf) => {
        const localDocs = localDocsByServerId.get(sf.id);
        if (!localDocs || localDocs.length === 0 || sf.is_deleted) return null;
        const localDoc = localDocs[0];
        const serverTime = new Date(sf.updated_at).getTime();
        const localTime = new Date(localDoc.updatedAt).getTime();
        return localTime > serverTime ? localDoc.id : null;
      })
      .filter((id): id is string => id !== null);

    const pendingOutboxSet = new Set<string>();
    if (potentialConflictDocIds.length > 0) {
      const pendingEntries = await db.outbox
        .find({
          selector: {
            localDocId: { $in: potentialConflictDocIds },
            status: 'pending',
          },
        })
        .exec();
      pendingEntries.forEach((e) => pendingOutboxSet.add(e.localDocId));
    }

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const serverField of serverFields) {
      const localDocs = localDocsByServerId.get(serverField.id) || [];
      if (serverField.is_deleted) {
        for (const doc of localDocs) idsToRemove.push(doc.id);
        continue;
      }

      if (localDocs.length > 0) {
        const localDoc = localDocs[0];
        const hasPending = pendingOutboxSet.has(localDoc.id);
        if (
          this.shouldOverwriteLocal(
            localDoc.updatedAt,
            serverField.updated_at,
            hasPending,
          )
        ) {
          toUpsert.push({
            ...localDoc.toJSON(),
            farm_id: serverField.farm_id,
            name: serverField.name,
            area_hectares: serverField.area_hectares,
            land_use: serverField.land_use,
            min_elevation: serverField.min_elevation,
            max_elevation: serverField.max_elevation,
            mean_elevation: serverField.mean_elevation,
            average_slope: serverField.average_slope,
            max_slope: serverField.max_slope,
            geometry_geojson: serverField.geometry_geojson,
            updatedAt: serverField.updated_at,
            syncStatus: 'synced' as any,
          });
        }
      } else {
        toUpsert.push({
          id: `server-${serverField.id}`,
          serverId: serverField.id,
          farm_id: serverField.farm_id,
          name: serverField.name,
          area_hectares: serverField.area_hectares,
          land_use: serverField.land_use,
          min_elevation: serverField.min_elevation,
          max_elevation: serverField.max_elevation,
          mean_elevation: serverField.mean_elevation,
          average_slope: serverField.average_slope,
          max_slope: serverField.max_slope,
          geometry_geojson: serverField.geometry_geojson,
          syncStatus: 'synced' as any,
          updatedAt: serverField.updated_at,
        });
      }
    }

    if (idsToRemove.length > 0) await db.fields.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.fields.bulkUpsert(toUpsert);
  }

  /** Upsert events from the server into local RxDB. */
  private async upsertEvents(
    db: SwardDatabase,
    serverEvents: any[],
  ): Promise<void> {
    if (serverEvents.length === 0) return;

    const serverIds = serverEvents.map((e) => e.id);
    const existingDocs = await db.events
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const localDocsByServerId = new Map<number, any[]>();
    for (const doc of existingDocs) {
      if (doc.serverId !== undefined) {
        const list = localDocsByServerId.get(doc.serverId) || [];
        list.push(doc);
        localDocsByServerId.set(doc.serverId, list);
      }
    }

    const potentialConflictDocIds = serverEvents
      .map((se) => {
        const localDocs = localDocsByServerId.get(se.id);
        if (!localDocs || localDocs.length === 0 || se.is_deleted) return null;
        const localDoc = localDocs[0];
        const serverTime = new Date(se.updated_at).getTime();
        const localTime = new Date(localDoc.updatedAt).getTime();
        return localTime > serverTime ? localDoc.id : null;
      })
      .filter((id): id is string => id !== null);

    const pendingOutboxSet = new Set<string>();
    if (potentialConflictDocIds.length > 0) {
      const pendingEntries = await db.outbox
        .find({
          selector: {
            localDocId: { $in: potentialConflictDocIds },
            status: 'pending',
          },
        })
        .exec();
      pendingEntries.forEach((e) => pendingOutboxSet.add(e.localDocId));
    }

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const serverEvent of serverEvents) {
      const localDocs = localDocsByServerId.get(serverEvent.id) || [];
      if (serverEvent.is_deleted) {
        for (const doc of localDocs) idsToRemove.push(doc.id);
        continue;
      }

      if (localDocs.length > 0) {
        const localDoc = localDocs[0];
        const hasPending = pendingOutboxSet.has(localDoc.id);
        if (
          this.shouldOverwriteLocal(
            localDoc.updatedAt,
            serverEvent.updated_at,
            hasPending,
          )
        ) {
          toUpsert.push({
            ...localDoc.toJSON(),
            event_type: serverEvent.event_type,
            description: serverEvent.description,
            date: serverEvent.date,
            mapp_number: serverEvent.mapp_number,
            eppo_code: serverEvent.eppo_code,
            bbch_growth_stage: serverEvent.bbch_growth_stage,
            updatedAt: serverEvent.updated_at,
            syncStatus: 'synced' as any,
          });
        }
      } else {
        toUpsert.push({
          id: `server-${serverEvent.id}`,
          serverId: serverEvent.id,
          field_id: serverEvent.field_id,
          event_type: serverEvent.event_type,
          description: serverEvent.description,
          date: serverEvent.date,
          mapp_number: serverEvent.mapp_number,
          eppo_code: serverEvent.eppo_code,
          bbch_growth_stage: serverEvent.bbch_growth_stage,
          syncStatus: 'synced' as any,
          updatedAt: serverEvent.updated_at,
        });
      }
    }

    if (idsToRemove.length > 0) await db.events.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.events.bulkUpsert(toUpsert);
  }

  /** Upsert soil analyses from the server into local RxDB. */
  private async upsertSoilAnalyses(
    db: SwardDatabase,
    serverAnalyses: any[],
  ): Promise<void> {
    if (serverAnalyses.length === 0) return;

    // 1. Bulk lookup existing local records by serverId
    const serverIds = serverAnalyses.map((a) => a.id);
    const existingDocs = await db.soil_analyses
      .find({
        selector: { serverId: { $in: serverIds } },
      })
      .exec();

    // Group local docs by serverId
    const localDocsByServerId = new Map<number, any[]>();
    for (const doc of existingDocs) {
      if (doc.serverId !== undefined) {
        const list = localDocsByServerId.get(doc.serverId) || [];
        list.push(doc);
        localDocsByServerId.set(doc.serverId, list);
      }
    }

    // 2. Pre-fetch pending outbox entries to avoid N+1
    const potentialConflictDocIds = serverAnalyses
      .map((sa) => {
        const localDocs = localDocsByServerId.get(sa.id);
        if (!localDocs || localDocs.length === 0 || sa.is_deleted) return null;
        const localDoc = localDocs[0];
        const serverTime = new Date(sa.updated_at).getTime();
        const localTime = new Date(localDoc.updatedAt).getTime();
        return localTime > serverTime ? localDoc.id : null;
      })
      .filter((id): id is string => id !== null);

    const pendingOutboxSet = new Set<string>();
    if (potentialConflictDocIds.length > 0) {
      const pendingEntries = await db.outbox
        .find({
          selector: {
            localDocId: { $in: potentialConflictDocIds },
            status: 'pending',
          },
        })
        .exec();
      pendingEntries.forEach((e) => pendingOutboxSet.add(e.localDocId));
    }

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    // 3. Process records
    for (const serverAnalysis of serverAnalyses) {
      const localDocs = localDocsByServerId.get(serverAnalysis.id) || [];

      if (serverAnalysis.is_deleted) {
        for (const doc of localDocs) {
          idsToRemove.push(doc.id);
        }
        continue;
      }

      if (localDocs.length > 0) {
        const localDoc = localDocs[0];
        const hasPending = pendingOutboxSet.has(localDoc.id);
        if (
          this.shouldOverwriteLocal(
            localDoc.updatedAt,
            serverAnalysis.updated_at,
            hasPending,
          )
        ) {
          toUpsert.push({
            ...localDoc.toJSON(),
            ph_level: serverAnalysis.ph_level,
            phosphorus_index: serverAnalysis.phosphorus_index,
            potassium_index: serverAnalysis.potassium_index,
            magnesium_index: serverAnalysis.magnesium_index,
            updatedAt: serverAnalysis.updated_at,
            syncStatus: 'synced' as any,
          });
        }
      } else {
        toUpsert.push({
          id: `server-${serverAnalysis.id}`,
          serverId: serverAnalysis.id,
          field_id: serverAnalysis.field_id,
          sample_date: serverAnalysis.sample_date,
          ph_level: serverAnalysis.ph_level,
          phosphorus_index: serverAnalysis.phosphorus_index,
          potassium_index: serverAnalysis.potassium_index,
          magnesium_index: serverAnalysis.magnesium_index,
          syncStatus: 'synced' as any,
          updatedAt: serverAnalysis.updated_at,
        });
      }
    }

    // 4. Batch database operations
    if (idsToRemove.length > 0) {
      await db.soil_analyses.bulkRemove(idsToRemove);
    }
    if (toUpsert.length > 0) {
      await db.soil_analyses.bulkUpsert(toUpsert);
    }
  }

  /** Upsert fertilisation plans from the server into local RxDB. */
  private async upsertFertilisationPlans(
    db: SwardDatabase,
    serverPlans: any[],
  ): Promise<void> {
    if (serverPlans.length === 0) return;

    const serverIds = serverPlans.map((p) => p.id);
    const existingDocs = await db.fertilisation_plans
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const localDocsByServerId = new Map<number, any[]>();
    for (const doc of existingDocs) {
      if (doc.serverId !== undefined) {
        const list = localDocsByServerId.get(doc.serverId) || [];
        list.push(doc);
        localDocsByServerId.set(doc.serverId, list);
      }
    }

    const potentialConflictDocIds = serverPlans
      .map((sp) => {
        const localDocs = localDocsByServerId.get(sp.id);
        if (!localDocs || localDocs.length === 0 || sp.is_deleted) return null;
        const localDoc = localDocs[0];
        const serverTime = new Date(sp.updated_at).getTime();
        const localTime = new Date(localDoc.updatedAt).getTime();
        return localTime > serverTime ? localDoc.id : null;
      })
      .filter((id): id is string => id !== null);

    const pendingOutboxSet = new Set<string>();
    if (potentialConflictDocIds.length > 0) {
      const pendingEntries = await db.outbox
        .find({
          selector: {
            localDocId: { $in: potentialConflictDocIds },
            status: 'pending',
          },
        })
        .exec();
      pendingEntries.forEach((e) => pendingOutboxSet.add(e.localDocId));
    }

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const serverPlan of serverPlans) {
      const localDocs = localDocsByServerId.get(serverPlan.id) || [];
      if (serverPlan.is_deleted) {
        for (const doc of localDocs) idsToRemove.push(doc.id);
        continue;
      }

      if (localDocs.length > 0) {
        const localDoc = localDocs[0];
        const hasPending = pendingOutboxSet.has(localDoc.id);
        if (
          this.shouldOverwriteLocal(
            localDoc.updatedAt,
            serverPlan.updated_at,
            hasPending,
          )
        ) {
          toUpsert.push({
            ...localDoc.toJSON(),
            crop_type: serverPlan.crop_type,
            target_yield: serverPlan.target_yield,
            nitrogen_requirement: serverPlan.nitrogen_requirement,
            phosphorus_requirement: serverPlan.phosphorus_requirement,
            potassium_requirement: serverPlan.potassium_requirement,
            application_date: serverPlan.application_date,
            updatedAt: serverPlan.updated_at,
            syncStatus: 'synced' as any,
          });
        }
      } else {
        toUpsert.push({
          id: `server-${serverPlan.id}`,
          serverId: serverPlan.id,
          field_id: serverPlan.field_id,
          crop_type: serverPlan.crop_type,
          target_yield: serverPlan.target_yield,
          nitrogen_requirement: serverPlan.nitrogen_requirement,
          phosphorus_requirement: serverPlan.phosphorus_requirement,
          potassium_requirement: serverPlan.potassium_requirement,
          application_date: serverPlan.application_date,
          syncStatus: 'synced' as any,
          updatedAt: serverPlan.updated_at,
        });
      }
    }

    if (idsToRemove.length > 0)
      await db.fertilisation_plans.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.fertilisation_plans.bulkUpsert(toUpsert);
  }

  // ──────────────────────────────────────────────────────────
  // Local Doc Helpers
  // ──────────────────────────────────────────────────────────

  /** Update a local RxDB document's syncStatus. */

  private async upsertFertiliserApplications(
    db: SwardDatabase,
    serverApps: any[],
  ): Promise<void> {
    if (!serverApps || serverApps.length === 0) return;
    const serverIds = serverApps.map((a) => a.id);
    const existingDocs = await db.fertiliser_applications
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sApp of serverApps) {
      const localDoc = existingMap.get(sApp.id);

      if (sApp.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending') {
          idsToRemove.push(localDoc.id);
        }
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sApp.updated_at
          ? new Date(sApp.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        ) {
          continue;
        }
        toUpsert.push({
          ...localDoc.toJSON(),
          event_id: sApp.event_id,
          fertiliser_type: sApp.fertiliser_type,
          amount_applied: sApp.amount_applied,
          nitrogen_content: sApp.nitrogen_content,
          phosphorus_content: sApp.phosphorus_content,
          is_protected_urea: sApp.is_protected_urea,
          buffer_zone_confirmed: sApp.buffer_zone_confirmed,
          evidence_of_control: sApp.evidence_of_control,
          syncStatus: 'synced',
          updatedAt: sApp.updated_at,
        });
      } else {
        toUpsert.push({
          id: `server-${sApp.id}`,
          serverId: sApp.id,
          event_id: sApp.event_id,
          fertiliser_type: sApp.fertiliser_type,
          amount_applied: sApp.amount_applied,
          nitrogen_content: sApp.nitrogen_content,
          phosphorus_content: sApp.phosphorus_content,
          is_protected_urea: sApp.is_protected_urea,
          buffer_zone_confirmed: sApp.buffer_zone_confirmed,
          evidence_of_control: sApp.evidence_of_control,
          syncStatus: 'synced',
          updatedAt: sApp.updated_at || new Date().toISOString(),
        });
      }
    }

    if (toUpsert.length > 0) {
      await db.fertiliser_applications.bulkUpsert(toUpsert);
    }
    if (idsToRemove.length > 0) {
      await db.fertiliser_applications
        .find({ selector: { id: { $in: idsToRemove } } })
        .remove();
    }
  }

  private async upsertFarmRecords(
    db: SwardDatabase,
    serverRecords: any[],
  ): Promise<void> {
    if (!serverRecords || serverRecords.length === 0) return;
    const serverIds = serverRecords.map((r) => r.id);
    const existingDocs = await db.farm_records
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sRecord of serverRecords) {
      const localDoc = existingMap.get(sRecord.id);

      if (sRecord.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending') {
          idsToRemove.push(localDoc.id);
        }
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sRecord.updated_at
          ? new Date(sRecord.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        ) {
          continue;
        }
        toUpsert.push({
          ...localDoc.toJSON(),
          farm_id: sRecord.farm_id,
          agricultural_area: sRecord.agricultural_area,
          manure_storage_capacity: sRecord.manure_storage_capacity,
          year: sRecord.year,
          has_derogation: sRecord.has_derogation,
          updatedAt: sRecord.updated_at || new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        toUpsert.push({
          id: `server-${sRecord.id}`,
          serverId: sRecord.id,
          farm_id: sRecord.farm_id,
          agricultural_area: sRecord.agricultural_area,
          manure_storage_capacity: sRecord.manure_storage_capacity,
          year: sRecord.year,
          has_derogation: sRecord.has_derogation,
          syncStatus: 'synced',
          updatedAt: sRecord.updated_at || new Date().toISOString(),
        });
      }
    }

    if (idsToRemove.length > 0) await db.farm_records.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.farm_records.bulkUpsert(toUpsert);
  }

  private async upsertOrganicManureApplications(
    db: SwardDatabase,
    serverApps: any[],
  ): Promise<void> {
    if (!serverApps || serverApps.length === 0) return;
    const serverIds = serverApps.map((a) => a.id);
    const existingDocs = await db.organic_manure_applications
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sApp of serverApps) {
      const localDoc = existingMap.get(sApp.id);
      if (sApp.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending')
          idsToRemove.push(localDoc.id);
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sApp.updated_at
          ? new Date(sApp.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        )
          continue;
        toUpsert.push({
          ...localDoc.toJSON(),
          event_id: sApp.event_id,
          manure_type: sApp.manure_type,
          volume_applied_m3_per_ha: sApp.volume_applied_m3_per_ha,
          weight_applied_tonnes_per_ha: sApp.weight_applied_tonnes_per_ha,
          nitrogen_content_kg_per_unit: sApp.nitrogen_content_kg_per_unit,
          is_lesse_applied: sApp.is_lesse_applied,
          weather_conditions_confirmed: sApp.weather_conditions_confirmed,
          buffer_zone_distance_meters: sApp.buffer_zone_distance_meters,
          equipment_used: sApp.equipment_used,
          lesse_exemption_reason: sApp.lesse_exemption_reason,
          updatedAt: sApp.updated_at || new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        toUpsert.push({
          id: `server-${sApp.id}`,
          serverId: sApp.id,
          event_id: sApp.event_id,
          manure_type: sApp.manure_type,
          volume_applied_m3_per_ha: sApp.volume_applied_m3_per_ha,
          weight_applied_tonnes_per_ha: sApp.weight_applied_tonnes_per_ha,
          nitrogen_content_kg_per_unit: sApp.nitrogen_content_kg_per_unit,
          is_lesse_applied: sApp.is_lesse_applied,
          weather_conditions_confirmed: sApp.weather_conditions_confirmed,
          buffer_zone_distance_meters: sApp.buffer_zone_distance_meters,
          equipment_used: sApp.equipment_used,
          lesse_exemption_reason: sApp.lesse_exemption_reason,
          syncStatus: 'synced',
          updatedAt: sApp.updated_at || new Date().toISOString(),
        });
      }
    }
    if (idsToRemove.length > 0)
      await db.organic_manure_applications.bulkRemove(idsToRemove);
    if (toUpsert.length > 0)
      await db.organic_manure_applications.bulkUpsert(toUpsert);
  }

  private async upsertComplianceBreaches(
    db: SwardDatabase,
    serverBreaches: any[],
  ): Promise<void> {
    if (!serverBreaches || serverBreaches.length === 0) return;
    const serverIds = serverBreaches.map((b) => b.id);
    const existingDocs = await db.compliance_breaches
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sBreach of serverBreaches) {
      const localDoc = existingMap.get(sBreach.id);
      if (sBreach.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending')
          idsToRemove.push(localDoc.id);
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sBreach.updated_at
          ? new Date(sBreach.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        )
          continue;
        toUpsert.push({
          ...localDoc.toJSON(),
          farm_id: sBreach.farm_id,
          breach_type: sBreach.breach_type,
          severity: sBreach.severity,
          estimated_penalty_percentage: sBreach.estimated_penalty_percentage,
          mandatory_training_required: sBreach.mandatory_training_required,
          breach_date: sBreach.breach_date,
          notes: sBreach.notes,
          is_repeat: sBreach.is_repeat,
          updatedAt: sBreach.updated_at || new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        toUpsert.push({
          id: `server-${sBreach.id}`,
          serverId: sBreach.id,
          farm_id: sBreach.farm_id,
          breach_type: sBreach.breach_type,
          severity: sBreach.severity,
          estimated_penalty_percentage: sBreach.estimated_penalty_percentage,
          mandatory_training_required: sBreach.mandatory_training_required,
          breach_date: sBreach.breach_date,
          notes: sBreach.notes,
          is_repeat: sBreach.is_repeat,
          syncStatus: 'synced',
          updatedAt: sBreach.updated_at || new Date().toISOString(),
        });
      }
    }
    if (idsToRemove.length > 0)
      await db.compliance_breaches.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.compliance_breaches.bulkUpsert(toUpsert);
  }

  private async upsertSwardMovements(
    db: SwardDatabase,
    serverMovements: any[],
  ): Promise<void> {
    if (!serverMovements || serverMovements.length === 0) return;
    const serverIds = serverMovements.map((m) => m.id);
    const existingDocs = await db.sward_movements
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sMove of serverMovements) {
      const localDoc = existingMap.get(sMove.id);
      if (sMove.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending')
          idsToRemove.push(localDoc.id);
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sMove.updated_at
          ? new Date(sMove.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        )
          continue;
        toUpsert.push({
          ...localDoc.toJSON(),
          farm_id: sMove.farm_id,
          movement_type: sMove.movement_type,
          quantity_m3: sMove.quantity_m3,
          date: sMove.date,
          manure_type: sMove.manure_type,
          consignee_name: sMove.consignee_name,
          consignee_address: sMove.consignee_address,
          consignor_name: sMove.consignor_name,
          consignor_address: sMove.consignor_address,
          transporter_name: sMove.transporter_name,
          contract_length_months: sMove.contract_length_months,
          updatedAt: sMove.updated_at || new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        toUpsert.push({
          id: `server-${sMove.id}`,
          serverId: sMove.id,
          farm_id: sMove.farm_id,
          movement_type: sMove.movement_type,
          quantity_m3: sMove.quantity_m3,
          date: sMove.date,
          manure_type: sMove.manure_type,
          consignee_name: sMove.consignee_name,
          consignee_address: sMove.consignee_address,
          consignor_name: sMove.consignor_name,
          consignor_address: sMove.consignor_address,
          transporter_name: sMove.transporter_name,
          contract_length_months: sMove.contract_length_months,
          syncStatus: 'synced',
          updatedAt: sMove.updated_at || new Date().toISOString(),
        });
      }
    }
    if (idsToRemove.length > 0)
      await db.sward_movements.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.sward_movements.bulkUpsert(toUpsert);
  }

  private async upsertInventoryStorage(
    db: SwardDatabase,
    serverStorages: any[],
  ): Promise<void> {
    if (!serverStorages || serverStorages.length === 0) return;
    const serverIds = serverStorages.map((s) => s.id);
    const existingDocs = await db.inventory_storage
      .find({ selector: { serverId: { $in: serverIds } } })
      .exec();
    const existingMap = new Map(existingDocs.map((d) => [d.serverId, d]));

    const toUpsert: any[] = [];
    const idsToRemove: string[] = [];

    for (const sStorage of serverStorages) {
      const localDoc = existingMap.get(sStorage.id);
      if (sStorage.is_deleted) {
        if (localDoc && localDoc.syncStatus !== 'pending')
          idsToRemove.push(localDoc.id);
        continue;
      }

      if (localDoc) {
        const localUpdatedAt = new Date(localDoc.updatedAt).getTime();
        const serverUpdatedAt = sStorage.updated_at
          ? new Date(sStorage.updated_at).getTime()
          : 0;
        if (
          localDoc.syncStatus === 'pending' &&
          localUpdatedAt > serverUpdatedAt
        )
          continue;
        toUpsert.push({
          ...localDoc.toJSON(),
          farm_id: sStorage.farm_id,
          name: sStorage.name,
          storage_type: sStorage.storage_type,
          capacity_volume: sStorage.capacity_volume,
          is_covered: sStorage.is_covered,
          updatedAt: sStorage.updated_at || new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        toUpsert.push({
          id: `server-${sStorage.id}`,
          serverId: sStorage.id,
          farm_id: sStorage.farm_id,
          name: sStorage.name,
          storage_type: sStorage.storage_type,
          capacity_volume: sStorage.capacity_volume,
          is_covered: sStorage.is_covered,
          syncStatus: 'synced',
          updatedAt: sStorage.updated_at || new Date().toISOString(),
        });
      }
    }
    if (idsToRemove.length > 0)
      await db.inventory_storage.bulkRemove(idsToRemove);
    if (toUpsert.length > 0) await db.inventory_storage.bulkUpsert(toUpsert);
  }

  private async updateLocalDocStatus(
    db: SwardDatabase,
    entityType: string,
    localDocId: string,
    status: 'synced' | 'failed',
  ): Promise<void> {
    const collection = (db as any)[entityType];
    if (!collection) return;
    const doc = await collection.findOne(localDocId).exec();
    if (doc) {
      await doc.patch({ syncStatus: status });
    }
  }

  /** Update a local RxDB document with the server-assigned ID and mark as synced. */
  private async updateLocalDocServerId(
    db: SwardDatabase,
    entityType: string,
    localDocId: string,
    serverId: number,
  ): Promise<void> {
    const collection = (db as any)[entityType];
    if (!collection) return;
    const doc = await collection.findOne(localDocId).exec();
    if (doc) {
      await doc.patch({ serverId, syncStatus: 'synced' as any });
    }
  }

  /**
   * Determine if a local document should be overwritten by a server document.
   * Uses Last-Write-Wins (LWW) conflict resolution logic, but respects local
   * pending changes in the outbox.
   */
  private shouldOverwriteLocal(
    localUpdatedAt: string,
    serverUpdatedAt: string,
    hasPending: boolean,
  ): boolean {
    const localTime = new Date(localUpdatedAt).getTime();
    const serverTime = new Date(serverUpdatedAt).getTime();
    return serverTime >= localTime || !hasPending;
  }

  // PRD Reference: 0001
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
