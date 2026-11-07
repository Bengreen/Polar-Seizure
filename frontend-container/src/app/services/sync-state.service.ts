import { Injectable } from '@angular/core';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  distinctUntilChanged,
} from 'rxjs';
import { NetworkService } from './network.service';

/** The possible sync states of the application. */
export type SyncState = 'offline' | 'syncing' | 'synced';

/**
 * Service that tracks the current synchronisation state of the application.
 *
 * State transitions:
 *  - When offline → `offline`
 *  - When sync operations are in progress → `syncing`
 *  - When all sync operations are complete → `synced`
 *
 * The sync engine (0011-04/0011-05) will call `setSyncing()` and `setSynced()`
 * to drive transitions. The network service drives the offline state automatically.
 */
@Injectable({
  providedIn: 'root',
})
export class SyncStateService {
  /** Internal subject tracking whether a sync operation is active. */
  private readonly syncActive$ = new BehaviorSubject<boolean>(false);

  /** Internal subject tracking the last successful sync time. */
  private readonly _lastSyncTime$ = new BehaviorSubject<Date | null>(null);

  /** The current sync state, derived from network status and sync activity. */
  readonly syncState$: Observable<SyncState>;

  /** The last successful sync time. */
  readonly lastSyncTime$: Observable<Date | null> = this._lastSyncTime$.asObservable();

  constructor(private networkService: NetworkService) {
    this.syncState$ = combineLatest([
      this.networkService.isOnline$,
      this.syncActive$,
    ]).pipe(
      // PRD Reference: 0001
      map(([isOnline, isSyncing]): SyncState => {
        if (!isOnline) return 'offline';
        if (isSyncing) return 'syncing';
        return 'synced';
      }),
      // PRD Reference: 0001
      distinctUntilChanged(),
    );
  }

  /** Called by the sync engine when sync operations begin. */
  // PRD Reference: 0001
  setSyncing(): void {
    this.syncActive$.next(true);
  }

  /** Called by the sync engine when sync operations complete. */
  // PRD Reference: 0001
  setSynced(): void {
    this.syncActive$.next(false);
  }

  /** Called by the sync engine to set the last successful sync time. */
  setLastSyncTime(date: Date | null): void {
    this._lastSyncTime$.next(date);
  }
}
