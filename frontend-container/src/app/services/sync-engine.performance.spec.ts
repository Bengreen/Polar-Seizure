import { TestBed } from '@angular/core/testing';
import { SyncEngineService } from './sync-engine.service';
import { RxdbService } from './rxdb/rxdb.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BehaviorSubject, of, EMPTY } from 'rxjs';
import { SyncStateService } from './sync-state.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { FarmManagementService } from './farm-management.service';

describe('SyncEngineService Performance', () => {
  let service: SyncEngineService;
  let rxdbService: RxdbService;
  let mockDbSubject: BehaviorSubject<any>;

  beforeEach(async () => {
    mockDbSubject = new BehaviorSubject<any>({
      metadata: { findOne: () => ({ exec: async () => null }) },
      outbox: { find: () => ({ $: EMPTY, exec: async () => [] }) }
    });

    const mockRxdbService = {
      db$: mockDbSubject,
      fallbackToRest$: new BehaviorSubject<boolean>(false),
    };

    const mockNetworkService = {
      isOnline$: of(true),
    };

    const mockSyncStateService = {
      setLastSyncTime: jasmine.createSpy('setLastSyncTime'),
      setSyncing: jasmine.createSpy('setSyncing'),
      setSynced: jasmine.createSpy('setSynced'),
    };

    const mockFarmManagementService = {
      apiUrl$: of('http://localhost/api'),
      getHeaders: () => ({}),
    };

    const mockAuthService = {
      getUserId: () => 'test-user',
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SyncEngineService,
        { provide: RxdbService, useValue: mockRxdbService },
        { provide: NetworkService, useValue: mockNetworkService },
        { provide: SyncStateService, useValue: mockSyncStateService },
        { provide: FarmManagementService, useValue: mockFarmManagementService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(SyncEngineService);
    rxdbService = TestBed.inject(RxdbService);
  });

  afterEach(() => {
    mockDbSubject.complete();
    if (service) {
      service.ngOnDestroy();
    }
  });

  it('should measure execution time of clearAllCollections', async () => {
    // Create a robust mock database
    const mockDb: any = {
      metadata: {
        findOne: () => ({
          exec: async () => null
        })
      },
      outbox: {
        find: () => ({
          $: EMPTY,
          exec: async () => []
        })
      }
    };

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

    let totalDocsCreated = 0;

    // Setup collections with mock find().exec() returning array of objects with id and remove/bulkRemove
    for (const name of collections) {
      const mockDocs: any[] = [];
      // create 100 docs per collection
      for(let i=0; i<100; i++) {
        mockDocs.push({ id: `doc-${name}-${i}`, remove: async () => {} });
        totalDocsCreated++;
      }

      if (!mockDb[name]) mockDb[name] = {};

      mockDb[name].find = () => ({
        $: EMPTY,
        exec: async () => {
           // To simulate some I/O delay, we wait 5ms before returning docs
           await new Promise(r => setTimeout(r, 5));
           return mockDocs;
        }
      });
      mockDb[name].bulkRemove = async (ids: any[]) => {
         // Simulate bulk remove delay 10ms
         await new Promise(r => setTimeout(r, 10));
      };
    }

    // Pass it into the behavior subject so subscriptions have it available immediately
    mockDbSubject.next(mockDb);

    // Give subscriptions a moment to run
    await new Promise(r => setTimeout(r, 10));

    console.log(`Starting benchmark for clearAllCollections with ${collections.length} collections and ${totalDocsCreated} total docs`);
    const startTime = performance.now();
    await service.clearAllCollections(mockDb);
    const endTime = performance.now();

    const duration = endTime - startTime;
    console.log(`BASELINE clearAllCollections took ${duration.toFixed(2)} ms`);

    expect(true).toBeTrue();
  });
});
