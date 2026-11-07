import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ErrorPageComponent } from './error-page.component';
import { AuthService } from '../services/auth.service';
import { SyncEngineService } from '../services/sync-engine.service';
import { RxdbService } from '../services/rxdb/rxdb.service';

describe('ErrorPageComponent', () => {
  let component: ErrorPageComponent;
  let fixture: ComponentFixture<ErrorPageComponent>;
  let mockRouter: any;
  let mockAuthService: any;
  let mockSyncEngineService: any;
  let mockRxdbService: any;

  beforeEach(async () => {
    mockRouter = {
      getCurrentNavigation: jasmine.createSpy('getCurrentNavigation').and.returnValue({
        extras: {
          state: {
            error: 'Forbidden sync operation',
            errorCode: 403,
            isSyncError: true,
            previousUrl: '/home/fields',
          },
        },
      }),
      navigate: jasmine.createSpy('navigate'),
      navigateByUrl: jasmine.createSpy('navigateByUrl'),
    };

    mockAuthService = {
      getUserProfile: jasmine.createSpy('getUserProfile').and.returnValue({
        userId: 'user-123',
        username: 'johnsnow',
        email: 'johnsnow@example.com',
        roles: ['user', 'admin'],
      }),
      logout: jasmine.createSpy('logout'),
    };

    mockSyncEngineService = {
      fullSync: jasmine.createSpy('fullSync').and.returnValue(Promise.resolve()),
    };

    mockRxdbService = jasmine.createSpyObj('RxdbService', ['wipeDatabase']);
    mockRxdbService.wipeDatabase.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [ErrorPageComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SyncEngineService, useValue: mockSyncEngineService },
        { provide: RxdbService, useValue: mockRxdbService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create and populate error and user profile state', () => {
    expect(component).toBeTruthy();
    expect(component.errorCode).toBe(403);
    expect(component.errorMessage).toBe('Forbidden sync operation');
    expect(component.isSyncError).toBeTrue();
    expect(component.userProfile.username).toBe('johnsnow');
    expect(component.userProfile.userId).toBe('user-123');
  });

  it('should countdown and automatically trigger retrySync upon timer expiration', fakeAsync(() => {
    component.countdownMax = 3;
    component.startCountdown();
    expect(component.countdown).toBe(3);

    tick(1000);
    expect(component.countdown).toBe(2);

    tick(2000);
    expect(component.countdown).toBe(0);
    expect(mockSyncEngineService.fullSync).toHaveBeenCalled();
  }));

  it('should manually trigger retrySync when retry button is clicked and navigate back to previousUrl on success', fakeAsync(async () => {
    await component.retrySync();
    tick();

    expect(mockSyncEngineService.fullSync).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/home/fields');
  }));

  it('should navigate to login on auth error when goHome is called', async () => {
    component.isAuthError = true;
    await component.goHome();

    expect(mockRxdbService.wipeDatabase).toHaveBeenCalled();
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
