import { LoggerService } from '../logger.service';
import {
  Injectable,
  OnDestroy,
  InjectionToken,
  Inject,
  Optional,
} from '@angular/core';
import {
  createRxDatabase,
  RxDatabase,
  RxCollection,
  RxStorage,
  removeRxDatabase,
  addRxPlugin,
} from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { firstValueFrom } from 'rxjs';

addRxPlugin(RxDBMigrationPlugin);
import {
  Observable,
  from,
  shareReplay,
  switchMap,
  BehaviorSubject,
} from 'rxjs';

import * as MurmurHash3 from 'murmurhash3js-revisited';

/**
 * A pure-JS MurmurHash3 (x86 128-bit) hash function that does NOT rely on
 * crypto.subtle. crypto.subtle is only available in secure contexts (HTTPS /
 * localhost), so this allows RxDB to work over plain HTTP (e.g. local k8s dev).
 *
 * MurmurHash3 is a production-quality, collision-resistant, non-cryptographic
 * hash algorithm — appropriate for RxDB document fingerprinting.
 * Accepts string | ArrayBuffer | Blob to satisfy RxDB's HashFunction contract.
 */
// PRD Reference: 0001
async function murmurhash3Hash(
  input: string | ArrayBuffer | Blob,
): Promise<string> {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Blob) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else {
    bytes = new Uint8Array(input);
  }
  return MurmurHash3.x86.hash128(bytes, 0);
}

import {
  FarmDocType,
  FieldDocType,
  EventDocType,
  OutboxDocType,
  MetadataDocType,
  SoilAnalysisDocType,
  FertilisationPlanDocType,
  FarmRecordDocType,
  FertiliserApplicationDocType,
  OrganicManureApplicationDocType,
  ComplianceBreachDocType,
  SwardMovementDocType,
  InventoryStorageDocType,
  InventoryChemicalDocType,
  farmSchema,
  fieldSchema,
  eventSchema,
  outboxSchema,
  metadataSchema,
  soilAnalysisSchema,
  fertilisationPlanSchema,
  farmRecordSchema,
  fertiliserApplicationSchema,
  organicManureApplicationSchema,
  complianceBreachSchema,
  swardMovementSchema,
  inventoryStorageSchema,
  inventoryChemicalSchema,
} from './schemas';

/** Injection token for providing an alternative RxStorage (e.g. memory for tests). */
export const RXDB_STORAGE = new InjectionToken<RxStorage<any, any>>(
  'RXDB_STORAGE',
);

/** Injection token for overriding the database name (e.g. unique name per test). */
export const RXDB_DB_NAME = new InjectionToken<string>('RXDB_DB_NAME');

/** The shape of our RxDB database */
export type SwardCollections = {
  farms: RxCollection<FarmDocType>;
  fields: RxCollection<FieldDocType>;
  events: RxCollection<EventDocType>;
  soil_analyses: RxCollection<SoilAnalysisDocType>;
  fertilisation_plans: RxCollection<FertilisationPlanDocType>;
  farm_records: RxCollection<FarmRecordDocType>;
  fertiliser_applications: RxCollection<FertiliserApplicationDocType>;
  organic_manure_applications: RxCollection<OrganicManureApplicationDocType>;
  compliance_breaches: RxCollection<ComplianceBreachDocType>;
  sward_movements: RxCollection<SwardMovementDocType>;
  inventory_storage: RxCollection<InventoryStorageDocType>;
  inventory_chemicals: RxCollection<InventoryChemicalDocType>;
  outbox: RxCollection<OutboxDocType>;
  metadata: RxCollection<MetadataDocType>;
};
export type SwardDatabase = RxDatabase<SwardCollections>;

/**
 * Service responsible for creating and exposing the RxDB database.
 *
 * Consumers should use the `db$` observable or the typed collection
 * accessors (`farmsCollection$`, `fieldsCollection$`, `eventsCollection$`, etc.)
 * to interact with local data.
 *
 * For testing, provide `RXDB_STORAGE` with `getRxStorageMemory()` and
 * `RXDB_DB_NAME` with a unique name to avoid cross-test contamination.
 */
@Injectable({
  providedIn: 'root',
})
export class RxdbService implements OnDestroy {
  /** The lazily-initialised database observable — shared across all consumers. */
  readonly db$: Observable<SwardDatabase>;

  /** Emits true if the database cannot be initialized (falling back to REST mode). */
  readonly fallbackToRest$ = new BehaviorSubject<boolean>(false);

  private storage: RxStorage<any, any>;
  private dbName: string;

  constructor(
    @Optional() @Inject(RXDB_STORAGE) storage: RxStorage<any, any> | null,
    @Optional() @Inject(RXDB_DB_NAME) dbName: string | null,
    private logger: LoggerService,
  ) {
    this.storage = storage || getRxStorageDexie();
    let userId: string | null = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        userId = window.localStorage.getItem('agent-user-id');
      }
    } catch (e) {
      // ignore localStorage errors in non-browser envs
    }
    this.dbName = dbName || (userId ? `swarddb_${userId}` : 'swarddb');
    this.db$ = from(this.createDatabase()).pipe(shareReplay(1));
  }

  /** Create the RxDB database and add all collections. Wrap in try/catch for self-healing. */
  // PRD Reference: 0001
  private async createDatabase(): Promise<SwardDatabase> {
    try {
      return await this.tryCreateDatabase();
    } catch (err) {
      this.logger.warn(
        'RxDB Database initialization failed. Attempting self-healing/wipe...',
        err,
      );
      try {
        // Attempt to wipe the existing database.
        // NOTE: We cannot use `firstValueFrom(this.db$)` here because this
        // function IS the source of db$ — calling it would create a circular
        // deadlock. Since db creation just failed there is no live instance, so
        // we wipe directly via removeRxDatabase.
        await removeRxDatabase(this.dbName, this.storage);

        this.logger.log(
          'RxDB Database successfully wiped. Re-attempting initialization.',
        );

        // Re-try database creation
        return await this.tryCreateDatabase();
      } catch (retryErr) {
        this.logger.error(
          'RxDB Database initialization failed on second attempt. Falling back to REST mode.',
          retryErr,
        );
        this.fallbackToRest$.next(true);
        throw retryErr;
      }
    }
  }

  // PRD Reference: 0001
  private async tryCreateDatabase(): Promise<SwardDatabase> {
    // E2E Test hooks to simulate database failures via query parameters
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.search.includes('mock-db-fail-persistent')) {
        throw new Error('Simulated persistent database failure');
      }
      if (window.location.search.includes('mock-db-fail-retry')) {
        const attempts = sessionStorage.getItem('db-init-attempts') || '0';
        if (attempts === '0') {
          sessionStorage.setItem('db-init-attempts', '1');
          throw new Error('Simulated database corruption/schema mismatch');
        } else {
          sessionStorage.removeItem('db-init-attempts');
        }
      }
    }

    let db: SwardDatabase | null = null;
    try {
      db = await createRxDatabase<SwardCollections>({
        name: this.dbName,
        storage: this.storage,
        closeDuplicates: true,
        // Use MurmurHash3 (pure-JS, no crypto.subtle) so RxDB works over plain
        // HTTP where browsers restrict the Web Crypto API to secure contexts only.
        hashFunction: murmurhash3Hash,
      });

      await db.addCollections({
        farms: {
          schema: farmSchema,
          migrationStrategies: {
            1: function(oldDoc) {
              oldDoc.photo = null;
              return oldDoc;
            }
          }
        },
        fields: { schema: fieldSchema },
        events: { schema: eventSchema },
        soil_analyses: { schema: soilAnalysisSchema },
        fertilisation_plans: { schema: fertilisationPlanSchema },
        farm_records: { schema: farmRecordSchema },
        fertiliser_applications: { schema: fertiliserApplicationSchema },
        organic_manure_applications: { schema: organicManureApplicationSchema },
        compliance_breaches: { schema: complianceBreachSchema },
        sward_movements: { schema: swardMovementSchema },
        inventory_storage: { schema: inventoryStorageSchema },
        inventory_chemicals: { schema: inventoryChemicalSchema },
        outbox: { schema: outboxSchema },
        metadata: { schema: metadataSchema },
      });

      return db;
    } catch (err) {
      if (db) {
        try {
          await db.close();
        } catch (closeErr) {
          // ignore close errors
        }
      }
      throw err;
    }
  }


  /** Wipes the entire RxDB database. Used during logout. */
  async wipeDatabase(): Promise<void> {
    try {
      this.logger.log('Wiping RxDB Database on demand...');


      // If we use db.remove(), we must ensure no one else is using it. Since it's a shared observable,
      // someone might still have it. It's safer to just wipe it via removeRxDatabase which targets the underlying storage directly
      // However, db.remove() handles cleanup better if the instance is active.
      const db = await firstValueFrom(this.db$).catch(() => null);
      if (db) {
        try {
          await db.remove();
        } catch (e) {
          await removeRxDatabase(this.dbName, this.storage);
        }
      } else {
        await removeRxDatabase(this.dbName, this.storage);
      }


      this.logger.log('RxDB Database successfully wiped.');
    } catch (err) {
      this.logger.error('Failed to wipe RxDB Database.', err);
      throw err;
    }
  }

  /** Observable emitting the inventory chemicals RxCollection. */
  get inventoryChemicalsCollection$(): Observable<
    RxCollection<InventoryChemicalDocType>
  > {
    return this.db$.pipe(
      // PRD Reference: 0001
      switchMap((db) => from(Promise.resolve(db.inventory_chemicals))),
    );
  }

  /** Observable emitting the farms RxCollection. */
  get farmsCollection$(): Observable<RxCollection<FarmDocType>> {
    return this.db$.pipe(switchMap((db) => from(Promise.resolve(db.farms))));
  }

  /** Observable emitting the fields RxCollection. */
  get fieldsCollection$(): Observable<RxCollection<FieldDocType>> {
    return this.db$.pipe(switchMap((db) => from(Promise.resolve(db.fields))));
  }

  /** Observable emitting the events RxCollection. */
  get eventsCollection$(): Observable<RxCollection<EventDocType>> {
    return this.db$.pipe(switchMap((db) => from(Promise.resolve(db.events))));
  }

  /** Observable emitting the soil analyses RxCollection. */
  get soilAnalysesCollection$(): Observable<RxCollection<SoilAnalysisDocType>> {
    return this.db$.pipe(
      // PRD Reference: 0001
      switchMap((db) => from(Promise.resolve(db.soil_analyses))),
    );
  }

  /** Observable emitting the fertilisation plans RxCollection. */
  get fertilisationPlansCollection$(): Observable<
    RxCollection<FertilisationPlanDocType>
  > {
    return this.db$.pipe(
      // PRD Reference: 0001
      switchMap((db) => from(Promise.resolve(db.fertilisation_plans))),
    );
  }

  /** Observable emitting the farm records RxCollection. */
  get farmRecordsCollection$(): Observable<RxCollection<FarmRecordDocType>> {
    return this.db$.pipe(
      // PRD Reference: 0001
      switchMap((db) => from(Promise.resolve(db.farm_records))),
    );
  }

  /** Observable emitting the fertiliser applications RxCollection. */
  get fertiliserApplicationsCollection$(): Observable<RxCollection<FertiliserApplicationDocType>> {
    return this.db$.pipe(
      switchMap((db) => from(Promise.resolve(db.fertiliser_applications))),
    );
  }

  /** Observable emitting the sward movements RxCollection. */
  get swardMovementsCollection$(): Observable<
    RxCollection<SwardMovementDocType>
  > {
    return this.db$.pipe(
      // PRD Reference: 0001
      switchMap((db) => from(Promise.resolve(db.sward_movements))),
    );
  }

  /** Observable emitting the outbox RxCollection. */
  get outboxCollection$(): Observable<RxCollection<OutboxDocType>> {
    return this.db$.pipe(switchMap((db) => from(Promise.resolve(db.outbox))));
  }

  /** Observable emitting the metadata RxCollection. */
  get metadataCollection$(): Observable<RxCollection<MetadataDocType>> {
    return this.db$.pipe(switchMap((db) => from(Promise.resolve(db.metadata))));
  }

  // PRD Reference: 0001
  async ngOnDestroy(): Promise<void> {
    const db = await this.db$.toPromise();
    if (db) {
      await db.close();
    }
  }
}
