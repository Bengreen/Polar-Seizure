import { LoggerService } from '../services/logger.service';
import { APP_CONFIG } from '../app-config';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { SyncStatusComponent } from './sync-status.component';
import { SyncStateService, SyncState } from '../services/sync-state.service';
import { SyncEngineService } from '../services/sync-engine.service';

// PRD Reference: 0001
describe('SyncStatusComponent', () => {
  let component: SyncStatusComponent;
  let fixture: ComponentFixture<SyncStatusComponent>;
  let syncState$: BehaviorSubject<SyncState>;
  let syncEngineServiceSpy: jasmine.SpyObj<SyncEngineService>;

  // PRD Reference: 0001
  beforeEach(async () => {
    syncState$ = new BehaviorSubject<SyncState>('synced');
    syncEngineServiceSpy = jasmine.createSpyObj('SyncEngineService', [
      'forcePullSync',
    ]);
    syncEngineServiceSpy.forcePullSync.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [SyncStatusComponent],
      providers: [
        {
          provide: SyncStateService,
          useValue: { syncState$: syncState$.asObservable() },
        },
        {
          provide: SyncEngineService,
          useValue: syncEngineServiceSpy,
        },
        { provide: APP_CONFIG, useValue: { apiPath: "/api", logLevel: "DEBUG" } },
        LoggerService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SyncStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // PRD Reference: 0001
  it('should create', () => {
    // PRD Reference: 0001
    expect(component).toBeTruthy();
  });

  // PRD Reference: 0001
  it('should show cloud_done icon when synced', () => {
    const el = fixture.nativeElement as HTMLElement;
    const icon = el.querySelector(
      '[data-testid="sync-status-synced"] .sync-icon--synced',
    );
    // PRD Reference: 0001
    expect(icon).toBeTruthy();
    // PRD Reference: 0001
    expect(icon!.textContent).toContain('cloud_done');
  });

  // PRD Reference: 0001
  it('should show cloud_off icon and Offline label when offline', () => {
    syncState$.next('offline');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const icon = el.querySelector(
      '[data-testid="sync-status-offline"] .sync-icon--offline',
    );
    // PRD Reference: 0001
    expect(icon).toBeTruthy();
    // PRD Reference: 0001
    expect(icon!.textContent).toContain('cloud_off');

    const label = el.querySelector('.sync-label--offline');
    // PRD Reference: 0001
    expect(label).toBeTruthy();
    // PRD Reference: 0001
    expect(label!.textContent).toContain('Offline');
  });

  // PRD Reference: 0001
  it('should show sync icon with animation when syncing', () => {
    syncState$.next('syncing');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const icon = el.querySelector(
      '[data-testid="sync-status-syncing"] .sync-icon--syncing',
    );
    // PRD Reference: 0001
    expect(icon).toBeTruthy();
    // PRD Reference: 0001
    expect(icon!.textContent).toContain('sync');
  });

  // PRD Reference: 0001
  it('should not show a label when synced', () => {
    const el = fixture.nativeElement as HTMLElement;
    const label = el.querySelector('.sync-label--offline');
    // PRD Reference: 0001
    expect(label).toBeNull();
  });

  // PRD Reference: 0001
  it('should call forcePullSync on click', () => {
    const el = fixture.nativeElement as HTMLElement;
    const indicator = el.querySelector('.sync-indicator') as HTMLElement;
    // PRD Reference: 0001
    expect(indicator).toBeTruthy();
    indicator.click();
    // PRD Reference: 0001
    expect(syncEngineServiceSpy.forcePullSync).toHaveBeenCalled();
  });
});
