import { TestBed } from '@angular/core/testing';
import { firstValueFrom, BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';
import { SyncStateService, SyncState } from './sync-state.service';
import { NetworkService } from './network.service';

// PRD Reference: 0001
describe('SyncStateService', () => {
  let service: SyncStateService;
  let mockOnline$: BehaviorSubject<boolean>;

  // PRD Reference: 0001
  beforeEach(() => {
    mockOnline$ = new BehaviorSubject<boolean>(true);
    TestBed.configureTestingModule({
      providers: [
        SyncStateService,
        {
          provide: NetworkService,
          useValue: { isOnline$: mockOnline$.asObservable() },
        },
      ],
    });
    service = TestBed.inject(SyncStateService);
  });

  // PRD Reference: 0001
  it('should be created', () => {
    // PRD Reference: 0001
    expect(service).toBeTruthy();
  });

  // PRD Reference: 0001
  it('should emit "synced" when online and not syncing', async () => {
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('synced');
  });

  // PRD Reference: 0001
  it('should emit "offline" when the network goes offline', async () => {
    mockOnline$.next(false);
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('offline');
  });

  // PRD Reference: 0001
  it('should emit "syncing" when online and setSyncing() is called', async () => {
    service.setSyncing();
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('syncing');
  });

  // PRD Reference: 0001
  it('should return to "synced" after setSynced() is called', async () => {
    service.setSyncing();
    service.setSynced();
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('synced');
  });

  // PRD Reference: 0001
  it('should emit "offline" even if setSyncing() was called while offline', async () => {
    service.setSyncing();
    mockOnline$.next(false);
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('offline');
  });

  // PRD Reference: 0001
  it('should emit "syncing" when coming back online if sync was active', async () => {
    service.setSyncing();
    mockOnline$.next(false);
    mockOnline$.next(true);
    const state = await firstValueFrom(service.syncState$.pipe(take(1)));
    // PRD Reference: 0001
    expect(state).toBe('syncing');
  });
});
