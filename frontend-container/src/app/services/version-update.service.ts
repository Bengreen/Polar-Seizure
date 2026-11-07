import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, interval } from 'rxjs';
import { filter, first } from 'rxjs/operators';

/**
 * References PRD 0015
 * Service that manages automatic background update detection and auto-syncing
 * when new versions of the application are deployed.
 */
@Injectable({
  providedIn: 'root',
})
export class VersionUpdateService {
  constructor(
    private swUpdate: SwUpdate,
    private appRef: ApplicationRef
  ) {
    if (this.swUpdate.isEnabled) {
      this.initAutoUpdateChecks();
      this.initUpdateListener();
    }
  }

  /**
   * Initializes periodic background checks for new application versions.
   */
  private initAutoUpdateChecks(): void {
    // References PRD 0015
    const appIsStable$ = this.appRef.isStable.pipe(
      filter((isStable) => isStable === true),
      first()
    );
    const fifteenMinutes = 15 * 60 * 1000;
    const everyFifteenMinutes$ = interval(fifteenMinutes);

    concat(appIsStable$, everyFifteenMinutes$).subscribe(() => {
      this.swUpdate.checkForUpdate().catch((err) => {
        console.error('Error checking for version updates:', err);
      });
    });

    // Also check when the user returns to the tab
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.swUpdate.checkForUpdate().catch(() => {});
      });
    }
  }

  /**
   * Listens for VERSION_READY events and automatically activates update + reloads.
   */
  private initUpdateListener(): void {
    // References PRD 0015
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(() => {
        this.swUpdate
          .activateUpdate()
          .then(() => {
            if (typeof window !== 'undefined' && !(window as any).__karma__) {
              window.location.reload();
            }
          })
          .catch((err) => {
            console.error('Failed to activate version update:', err);
          });
      });
  }
}
