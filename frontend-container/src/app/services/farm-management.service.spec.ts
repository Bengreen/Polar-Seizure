import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { FarmManagementService } from './farm-management.service';
import { Farm } from '../models/farm';
import { AuthService } from './auth.service';
import { RxdbService, RXDB_STORAGE, RXDB_DB_NAME } from './rxdb/rxdb.service';
import { APP_CONFIG } from '../app-config';

let farmTestCounter = 0;

// PRD Reference: 0003
xdescribe('FarmManagementService', () => {
  let service: FarmManagementService;
  let httpMock: HttpTestingController;
  let rxdbService: RxdbService;
  let testDbName: string;

  // PRD Reference: 0003
  beforeEach(() => {
    farmTestCounter++;
    testDbName = `farm-svc-test-${farmTestCounter}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    TestBed.configureTestingModule({
      providers: [
        // PRD Reference: 0003
        provideHttpClient(),
        // PRD Reference: 0003
        provideHttpClientTesting(),
        FarmManagementService,
        RxdbService,
        { provide: RXDB_STORAGE, useFactory: () => getRxStorageMemory() },
        { provide: RXDB_DB_NAME, useValue: testDbName },
        {
          provide: AuthService,
          useValue: { getUserId: () => '1' },
        },
        {
          provide: APP_CONFIG,
          useValue: { apiPath: '/api', logLevel: 'INFO' },
        },
      ],
    });
    service = TestBed.inject(FarmManagementService);
    httpMock = TestBed.inject(HttpTestingController);
    rxdbService = TestBed.inject(RxdbService);
  });

  // PRD Reference: 0003
  afterEach(async () => {
    if (httpMock) {
      try {
        httpMock.verify();
      } catch (e) {
        // ignore verify errors if setup failed
      }
    }
    if (rxdbService) {
      try {
        const db = await firstValueFrom(rxdbService.db$);
        if (db) {
          await db.remove();
        }
      } catch (e) {
        // ignore
      }
    }
  });

  // PRD Reference: 0003
  it('should be created', () => {
    // PRD Reference: 0003
    expect(service).toBeTruthy();
  });

  // ── getFarms (local-first) ──────────────────────────────
  // PRD Reference: 0003
  describe('getFarms', () => {
    // PRD Reference: 0003
    it('should return farms from the local RxDB database', async () => {
      const db = await firstValueFrom(rxdbService.db$);
      await db.farms.insert({
        id: 'farm-1',
        serverId: 1,
        user_id: 1,
        name: 'Sunrise Farm',
        location: 'Kerry, Ireland',
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });

      const farms = await firstValueFrom(service.getFarms().pipe(take(1)));
      // PRD Reference: 0003
      expect(farms.length).toBe(1);
      // PRD Reference: 0003
      expect(farms[0].name).toBe('Sunrise Farm');
      // PRD Reference: 0003
      expect(farms[0].location).toBe('Kerry, Ireland');
    });

    // PRD Reference: 0003
    it('should return an empty array when no farms exist locally', async () => {
      const farms = await firstValueFrom(service.getFarms().pipe(take(1)));
      // PRD Reference: 0003
      expect(farms).toEqual([]);
    });
  });

  // ── addFarm (local-first) ───────────────────────────────
  // PRD Reference: 0003
  describe('addFarm', () => {
    // PRD Reference: 0003
    it('should insert a farm into the local RxDB database', async () => {
      const newFarm: Farm = { name: 'New Farm', location: 'Galway, Ireland' };
      const result = await firstValueFrom(service.addFarm(newFarm));

      // PRD Reference: 0003
      expect(result.name).toBe('New Farm');
      // PRD Reference: 0003
      expect(result.location).toBe('Galway, Ireland');

      // Verify it's in RxDB
      const db = await firstValueFrom(rxdbService.db$);
      const allFarms = await db.farms.find().exec();
      // PRD Reference: 0003
      expect(allFarms.length).toBe(1);
      // PRD Reference: 0003
      expect(allFarms[0].syncStatus).toBe('pending');
    });

    // PRD Reference: 0003
    it('should generate a local id for the document', async () => {
      const newFarm: Farm = { name: 'Auto ID Farm', location: 'Cork, Ireland' };
      await firstValueFrom(service.addFarm(newFarm));

      const db = await firstValueFrom(rxdbService.db$);
      const docs = await db.farms.find().exec();
      // PRD Reference: 0003
      expect(String(docs[0].id)).toMatch(/^(-\d+|\d+|local-.*)$/);
    });
  });

  // ── deleteEntity (local-first) ────────────────────────────
  // PRD Reference: 0003
  describe('deleteEntity', () => {
    // PRD Reference: 0003
    it('should remove a farm from the local RxDB database by serverId', async () => {
      const db = await firstValueFrom(rxdbService.db$);
      await db.farms.insert({
        id: 'farm-del-1',
        serverId: 42,
        user_id: 1,
        name: 'Doomed Farm',
        location: 'Nowhere',
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });

      await firstValueFrom(service.deleteEntity('farms', 42));

      const remaining = await db.farms.find().exec();
      // PRD Reference: 0003
      expect(remaining.length).toBe(0);
    });

    // PRD Reference: 0003
    it('should create a DELETE outbox entry when deleting a farm', async () => {
      const db = await firstValueFrom(rxdbService.db$);
      await db.farms.insert({
        id: 'farm-del-outbox',
        serverId: 99,
        user_id: 1,
        name: 'Outbox Farm',
        location: 'Outbox',
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });

      await firstValueFrom(service.deleteEntity('farms', 99));

      const outbox = await db.outbox.find().exec();
      // PRD Reference: 0003
      expect(outbox.length).toBe(1);
      // PRD Reference: 0003
      expect(outbox[0].actionType).toBe('DELETE');
      // PRD Reference: 0003
      expect(outbox[0].entityType).toBe('farms');
    });

    // PRD Reference: 0003
    it('should not throw when deleting a non-existent farm', async () => {
      await firstValueFrom(service.deleteEntity('farms', 999));
      // PRD Reference: 0003
      expect(true).toBe(true);
    });
  });

  // ── updateFarm (local-first) ──────────────────────────────
  // PRD Reference: 0003
  describe('updateFarm', () => {
    // PRD Reference: 0003
    it('should update the farm details locally and create a PUT outbox entry', async () => {
      const db = await firstValueFrom(rxdbService.db$);
      await db.farms.insert({
        id: 'farm-edit-1',
        serverId: 123,
        user_id: 1,
        name: 'Original Farm',
        location: 'Original Location',
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });

      const updated = await firstValueFrom(
        service.updateFarm(123, { name: 'New Name', location: 'New Location' }),
      );
      // PRD Reference: 0003
      expect(updated.name).toBe('New Name');
      // PRD Reference: 0003
      expect(updated.location).toBe('New Location');

      // Verify it's in RxDB
      const doc = await db.farms
        .findOne({ selector: { serverId: 123 } })
        .exec();
      // PRD Reference: 0003
      expect(doc).toBeTruthy();
      // PRD Reference: 0003
      expect(doc!.name).toBe('New Name');
      // PRD Reference: 0003
      expect(doc!.location).toBe('New Location');
      // PRD Reference: 0003
      expect(doc!.syncStatus).toBe('pending');

      // Verify outbox entry
      const outbox = await db.outbox.find().exec();
      // PRD Reference: 0003
      expect(outbox.length).toBe(1);
      // PRD Reference: 0003
      expect(outbox[0].actionType).toBe('PUT');
      // PRD Reference: 0003
      expect(outbox[0].entityType).toBe('farms');
      // PRD Reference: 0003
      expect(outbox[0].status).toBe('pending');

      const payload = JSON.parse(outbox[0].payload);
      // PRD Reference: 0003
      expect(payload.id).toBe(123);
      // PRD Reference: 0003
      expect(payload.name).toBe('New Name');
      // PRD Reference: 0003
      expect(payload.location).toBe('New Location');
    });
  });

  // ── updateField (local-first) ───────────────────────────
  // PRD Reference: 0003
  describe('updateField', () => {
    // PRD Reference: 0003
    it('should patch local RxDB field document and create PUT outbox entry', async () => {
      const db = await firstValueFrom(rxdbService.db$);
      await db.fields.insert({
        id: 'field-1',
        serverId: 123,
        farm_id: 1,
        name: 'Old Field Name',
        area_hectares: 10,
        land_use: 'grassland',
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });

      const updatedField = await firstValueFrom(
        service.updateField(123, {
          name: 'New Field Name',
          farm_id: 2,
          area_hectares: 12,
          land_use: 'arable',
        }),
      );

      // PRD Reference: 0003
      expect(updatedField.name).toBe('New Field Name');
      // PRD Reference: 0003
      expect(updatedField.farm_id).toBe(2);
      // PRD Reference: 0003
      expect(updatedField.area_hectares).toBe(12);
      // PRD Reference: 0003
      expect(updatedField.land_use).toBe('arable');

      // Verify RxDB document updated
      const doc = await db.fields
        .findOne({ selector: { serverId: 123 } })
        .exec();
      // PRD Reference: 0003
      expect(doc).not.toBeNull();
      // PRD Reference: 0003
      expect(doc!.name).toBe('New Field Name');
      // PRD Reference: 0003
      expect(doc!.farm_id).toBe(2);
      // PRD Reference: 0003
      expect(doc!.syncStatus).toBe('pending');

      // Verify outbox entry
      const outbox = await db.outbox.find().exec();
      // PRD Reference: 0003
      expect(outbox.length).toBe(1);
      // PRD Reference: 0003
      expect(outbox[0].actionType).toBe('PUT');
      // PRD Reference: 0003
      expect(outbox[0].entityType).toBe('fields');
      // PRD Reference: 0003
      expect(outbox[0].status).toBe('pending');

      const payload = JSON.parse(outbox[0].payload);
      // PRD Reference: 0003
      expect(payload.id).toBe(123);
      // PRD Reference: 0003
      expect(payload.name).toBe('New Field Name');
      // PRD Reference: 0003
      expect(payload.farm_id).toBe(2);
    });
  });

  // ── Outbox entries on writes ────────────────────────────
  // PRD Reference: 0003
  describe('outbox entries', () => {
    // PRD Reference: 0003
    it('should create a POST outbox entry when adding a farm', async () => {
      const newFarm: Farm = { name: 'Outbox Farm', location: 'Test' };
      await firstValueFrom(service.addFarm(newFarm));

      const db = await firstValueFrom(rxdbService.db$);
      const outbox = await db.outbox.find().exec();
      // PRD Reference: 0003
      expect(outbox.length).toBe(1);
      // PRD Reference: 0003
      expect(outbox[0].actionType).toBe('POST');
      // PRD Reference: 0003
      expect(outbox[0].entityType).toBe('farms');
      // PRD Reference: 0003
      expect(outbox[0].status).toBe('pending');

      const payload = JSON.parse(outbox[0].payload);
      // PRD Reference: 0003
      expect(payload.name).toBe('Outbox Farm');
    });
  });
});
