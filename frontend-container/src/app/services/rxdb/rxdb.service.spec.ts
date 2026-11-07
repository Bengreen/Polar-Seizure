import { LoggerService } from '../logger.service';
import { APP_CONFIG } from '../../app-config';
import { TestBed } from '@angular/core/testing';
import {
  RxdbService,
  SwardDatabase,
  RXDB_STORAGE,
  RXDB_DB_NAME,
} from './rxdb.service';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom } from 'rxjs';
import * as rxdbModule from 'rxdb';

let testCounter = 0;

// PRD Reference: 0001
xdescribe('RxdbService', () => {
  let service: RxdbService;
  let testDbName: string;

  // PRD Reference: 0001
  beforeEach(() => {
    testCounter++;
    testDbName = `rxdb-svc-test-${testCounter}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    TestBed.configureTestingModule({
      providers: [
        RxdbService,
        { provide: RXDB_STORAGE, useFactory: () => getRxStorageMemory() },
        { provide: RXDB_DB_NAME, useValue: testDbName },
        { provide: APP_CONFIG, useValue: { apiPath: "/api", logLevel: "DEBUG" } },
        LoggerService,
      ],
    });
    service = TestBed.inject(RxdbService);
  });

  // PRD Reference: 0001
  afterEach(async () => {
    try {
      const db = await firstValueFrom(service.db$);
      if (db) {
        await db.remove();
      }
    } catch (e) {
      const storage = TestBed.inject(RXDB_STORAGE);
      await rxdbModule.removeRxDatabase(testDbName, storage);
    }
  });

  // PRD Reference: 0001
  it('should be created', () => {
    // PRD Reference: 0001
    expect(service).toBeTruthy();
  });

  // PRD Reference: 0001
  it('should create a database with the configured name', async () => {
    const db = await firstValueFrom(service.db$);
    // PRD Reference: 0001
    expect(db.name).toBe(testDbName);
  });

  // PRD Reference: 0001
  it('should have a farms collection', async () => {
    const db = await firstValueFrom(service.db$);
    // PRD Reference: 0001
    expect(db.farms).toBeDefined();
  });

  // PRD Reference: 0001
  it('should have a fields collection', async () => {
    const db = await firstValueFrom(service.db$);
    // PRD Reference: 0001
    expect(db.fields).toBeDefined();
  });

  // PRD Reference: 0001
  it('should have an events collection', async () => {
    const db = await firstValueFrom(service.db$);
    // PRD Reference: 0001
    expect(db.events).toBeDefined();
  });

  // PRD Reference: 0001
  it('should insert and retrieve a farm document', async () => {
    const db = await firstValueFrom(service.db$);
    const doc = await db.farms.insert({
      id: 'test-farm-1',
      name: 'Sunrise Farm',
      location: 'Kerry, Ireland',
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });

    // PRD Reference: 0001
    expect(doc.name).toBe('Sunrise Farm');

    const found = await db.farms.findOne('test-farm-1').exec();
    // PRD Reference: 0001
    expect(found).toBeTruthy();
    // PRD Reference: 0001
    expect(found!.location).toBe('Kerry, Ireland');
  });

  // PRD Reference: 0001
  it('should insert and retrieve a field document', async () => {
    const db = await firstValueFrom(service.db$);
    const doc = await db.fields.insert({
      id: 'test-field-1',
      farm_id: 1,
      name: 'North Meadow',
      area_hectares: 12.5,
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
    });

    // PRD Reference: 0001
    expect(doc.name).toBe('North Meadow');

    const found = await db.fields.findOne('test-field-1').exec();
    // PRD Reference: 0001
    expect(found).toBeTruthy();
    // PRD Reference: 0001
    expect(found!.area_hectares).toBe(12.5);
  });

  // PRD Reference: 0001
  it('should insert and retrieve an event document', async () => {
    const db = await firstValueFrom(service.db$);
    const doc = await db.events.insert({
      id: 'test-event-1',
      field_id: 1,
      event_type: 'planting',
      description: 'Spring barley planting',
      date: '2026-03-15',
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });

    // PRD Reference: 0001
    expect(doc.event_type).toBe('planting');

    const found = await db.events.findOne('test-event-1').exec();
    // PRD Reference: 0001
    expect(found).toBeTruthy();
    // PRD Reference: 0001
    expect(found!.description).toBe('Spring barley planting');
  });

  // PRD Reference: 0001
  it('should return the same database instance on multiple db$ subscriptions', async () => {
    const db1 = await firstValueFrom(service.db$);
    const db2 = await firstValueFrom(service.db$);
    // PRD Reference: 0001
    expect(db1).toBe(db2);
  });

  // PRD Reference: 0001

  it('should wipe database successfully on demand', async () => {
    spyOn(rxdbModule, 'removeRxDatabase').and.returnValue(Promise.resolve() as any);
    await service.wipeDatabase();
    expect(rxdbModule.removeRxDatabase).toHaveBeenCalled();
  });

  describe('Self-Healing & Fallback', () => {
    // PRD Reference: 0001
    it('should wipe database and retry on initialization failure', async () => {
      // Close the database instance created during construction to avoid storage lock/removal conflicts
      const existingDb = await firstValueFrom(service.db$);
      await existingDb.close();

      let callCount = 0;
      const tryCreateSpy = spyOn<any>(
        service,
        'tryCreateDatabase',
      ).and.callFake(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated database corruption/schema mismatch');
        }
        tryCreateSpy.and.callThrough();
        return await service['tryCreateDatabase']();
      });

      const db = await service['createDatabase']();
      // PRD Reference: 0001
      expect(db).toBeTruthy();
      // PRD Reference: 0001
      expect(callCount).toBe(2);

      // Clean up the newly created database instance
      await db.remove();
    });

    // PRD Reference: 0001
    it('should activate fallbackToRest on second failure', async () => {
      // Close the database instance created during construction to avoid storage lock/removal conflicts
      const existingDb = await firstValueFrom(service.db$);
      await existingDb.close();

      let callCount = 0;
      spyOn<any>(service, 'tryCreateDatabase').and.callFake(async () => {
        callCount++;
        throw new Error('Persistent failure');
      });

      try {
        await service['createDatabase']();
        // PRD Reference: 0001
        fail('Should have thrown an error');
      } catch (err) {
        // PRD Reference: 0001
        expect(callCount).toBe(2);
        // PRD Reference: 0001
        expect(service.fallbackToRest$.value).toBe(true);
      }
    });
  });
});
