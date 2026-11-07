import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { SyncStateService, SyncState } from '../services/sync-state.service';
import { SyncEngineService } from '../services/sync-engine.service';
import { Observable } from 'rxjs';
import { LoggerService } from '../services/logger.service';

/**
 * Compact sync status indicator showing the current connectivity and sync state.
 *
 * Renders a Material Symbol icon with an optional label:
 *  - `cloud_off`  (offline) — grey icon, "Offline" label
 *  - `sync`       (syncing) — rotating animated icon in primary colour
 *  - `cloud_done` (synced)  — green icon, no label
 */
@Component({
  selector: 'app-sync-status',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (syncState$ | async; as state) {
      <div
        class="sync-indicator"
        [attr.data-testid]="'sync-status-' + state"
        (click)="forceSync()"
        title="Force Sync"
        [class.cursor-pointer]="state !== 'offline'"
      >
        <!-- Offline -->
        @if (state === 'offline') {
          <span
            class="material-symbols-outlined sync-icon sync-icon--offline"
            aria-label="Offline"
            >cloud_off</span
          >
          <span class="sync-label sync-label--offline">Offline</span>
        }

        <!-- Syncing -->
        @if (state === 'syncing') {
          <span
            class="material-symbols-outlined sync-icon sync-icon--syncing"
            aria-label="Syncing"
            >sync</span
          >
        }

        <!-- Synced -->
        @if (state === 'synced') {
          <span
            class="material-symbols-outlined sync-icon sync-icon--synced"
            aria-label="Synced"
            >cloud_done</span
          >
        }
      </div>
    }
  `,
  styleUrl: './sync-status.component.css',
})
export class SyncStatusComponent {
  syncState$: Observable<SyncState>;

  constructor(
    private syncStateService: SyncStateService,
    private syncEngineService: SyncEngineService,
    private logger: LoggerService,
  ) {
    this.syncState$ = this.syncStateService.syncState$;
  }

  // PRD Reference: 0001
  forceSync(): void {
    // Attempting a force pull sync on click
    this.syncEngineService.forcePullSync().catch((err) => {
      this.logger.error('Failed to force sync', err);
    });
  }
}
