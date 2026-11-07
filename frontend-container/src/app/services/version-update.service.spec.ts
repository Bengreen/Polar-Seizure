import { TestBed } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { VersionUpdateService } from './version-update.service';

/**
 * References PRD 0015
 */
describe('VersionUpdateService', () => {
  let service: VersionUpdateService;
  let mockSwUpdate: any;
  let versionUpdates$: Subject<any>;

  beforeEach(() => {
    versionUpdates$ = new Subject<any>();
    mockSwUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      checkForUpdate: jasmine.createSpy('checkForUpdate').and.returnValue(Promise.resolve(true)),
      activateUpdate: jasmine.createSpy('activateUpdate').and.returnValue(Promise.resolve(true)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        VersionUpdateService,
        { provide: SwUpdate, useValue: mockSwUpdate },
      ],
    });
  });

  it('should be created', () => {
    service = TestBed.inject(VersionUpdateService);
    expect(service).toBeTruthy();
  });

  it('should check for update when initialized', () => {
    service = TestBed.inject(VersionUpdateService);
    expect(service).toBeTruthy();
  });

  it('should activate update when VERSION_READY event occurs', (done) => {
    service = TestBed.inject(VersionUpdateService);

    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    };

    versionUpdates$.next(event);

    setTimeout(() => {
      expect(mockSwUpdate.activateUpdate).toHaveBeenCalled();
      done();
    }, 50);
  });
});
