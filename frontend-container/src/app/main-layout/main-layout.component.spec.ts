import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainLayoutComponent } from './main-layout.component';
import { LoggerService } from '../services/logger.service';
import { APP_CONFIG } from '../app-config';
import { RxdbService } from '../services/rxdb/rxdb.service';
import { AuthService } from '../services/auth.service';
import { FarmManagementService } from '../services/farm-management.service';
import { DevAuthApiService } from '../services/dev-auth-api.service';
import { SyncEngineService } from '../services/sync-engine.service';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';

// No obvious PRD requirement
describe('MainLayoutComponent', () => {
  let component: MainLayoutComponent;
  let fixture: ComponentFixture<MainLayoutComponent>;
  let rxdbServiceSpy: jasmine.SpyObj<RxdbService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let farmServiceSpy: jasmine.SpyObj<FarmManagementService>;
  let devAuthApiSpy: jasmine.SpyObj<DevAuthApiService>;
  let syncEngineServiceSpy: jasmine.SpyObj<SyncEngineService>;
  let router: Router;

  const mockUser = {
    id: 1,
    name: "Seamus O'Neill",
    email: 'seamus@example.com',
    role: 'admin',
  };
  const mockUsers = [
    {
      id: 1,
      name: "Seamus O'Neill",
      email: 'seamus@example.com',
      role: 'admin',
    },
    { id: 2, name: 'John Doe', email: 'john@example.com', role: 'user' },
  ];

  // No obvious PRD requirement
  beforeEach(async () => {
    rxdbServiceSpy = jasmine.createSpyObj('RxdbService', ['wipeDatabase'], {
      fallbackToRest$: of(false),
    });
    rxdbServiceSpy.wipeDatabase.and.returnValue(Promise.resolve());
    authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getUserId',
      'login',
      'logout',
      'getUserRoles',
    ]);
    farmServiceSpy = jasmine.createSpyObj('FarmManagementService', [
      'getUser',
      'getUsers',
    ]);
    devAuthApiSpy = jasmine.createSpyObj('DevAuthApiService', ['getToken']);

    authServiceSpy.getUserId.and.returnValue('1');
    authServiceSpy.getUserRoles.and.returnValue(['admin']);
    farmServiceSpy.getUser.and.returnValue(of(mockUser));
    farmServiceSpy.getUsers.and.returnValue(of(mockUsers));
    devAuthApiSpy.getToken.and.returnValue(
      of({ access_token: 'new-fake-token' }),
    );
    syncEngineServiceSpy = jasmine.createSpyObj('SyncEngineService', [
      'forcePullSync',
    ]);

    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        // No obvious PRD requirement
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiPath: "/api", logLevel: "DEBUG" } },
        LoggerService,
        { provide: RxdbService, useValue: rxdbServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: FarmManagementService, useValue: farmServiceSpy },
        { provide: DevAuthApiService, useValue: devAuthApiSpy },
        { provide: SyncEngineService, useValue: syncEngineServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    // No obvious PRD requirement
    spyOn(router, 'navigate');
  });

  // No obvious PRD requirement
  it('should create and load data on init', () => {
    fixture.detectChanges();
    // No obvious PRD requirement
    expect(component).toBeTruthy();
    // No obvious PRD requirement
    expect(authServiceSpy.getUserId).toHaveBeenCalled();
    // No obvious PRD requirement
    expect(farmServiceSpy.getUser).toHaveBeenCalledWith('1');
    // No obvious PRD requirement
    expect(farmServiceSpy.getUsers).toHaveBeenCalled();
  });

  // No obvious PRD requirement
  it('should render switcher options', () => {
    fixture.detectChanges();
    const selectEl = fixture.debugElement.query(
      By.css('#user-switcher-dropdown'),
    );
    // No obvious PRD requirement
    expect(selectEl).toBeTruthy();

    const options = selectEl.nativeElement.querySelectorAll('option');
    // No obvious PRD requirement
    expect(options.length).toBe(2);
    // No obvious PRD requirement
    expect(options[0].textContent.trim()).toBe("Seamus O'Neill (admin)");
    // No obvious PRD requirement
    expect(options[1].textContent.trim()).toBe('John Doe (user)');
  });

  // No obvious PRD requirement
  it('should call devAuthApi.getToken, authService.login and reload on switchUser', () => {
    // No obvious PRD requirement
    spyOn(component, 'reloadPage');
    fixture.detectChanges();

    component.switchUser('2');
    // No obvious PRD requirement
    expect(devAuthApiSpy.getToken).toHaveBeenCalledWith(2, 'user');
    // No obvious PRD requirement
    expect(authServiceSpy.login).toHaveBeenCalledWith('2', 'new-fake-token');
    // No obvious PRD requirement
    expect(component.reloadPage).toHaveBeenCalled();
  });

  // No obvious PRD requirement
  it('should call switchUser when dropdown selection changes', () => {
    // No obvious PRD requirement
    spyOn(component, 'switchUser');
    fixture.detectChanges();

    const selectEl = fixture.debugElement.query(
      By.css('#user-switcher-dropdown'),
    );
    selectEl.nativeElement.value = '2';
    selectEl.nativeElement.dispatchEvent(new Event('change'));

    fixture.detectChanges();
    // No obvious PRD requirement
    expect(component.switchUser).toHaveBeenCalledWith('2');
  });

  it('should hide user-switcher-dropdown when auth configuration is provided for a standard user', async () => {
    farmServiceSpy.getUser.and.returnValue(
      of({ id: 2, name: 'John Doe', email: 'john@example.com', role: 'user' }),
    );
    authServiceSpy.getUserRoles.and.returnValue(['user']);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: {
            apiPath: '/api',
            logLevel: 'DEBUG',
            auth: { issuer: 'https://keycloak.example.com', clientId: 'test' },
          },
        },
        LoggerService,
        { provide: RxdbService, useValue: rxdbServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: FarmManagementService, useValue: farmServiceSpy },
        { provide: DevAuthApiService, useValue: devAuthApiSpy },
        { provide: SyncEngineService, useValue: syncEngineServiceSpy },
      ],
    }).compileComponents();

    const fixtureAuth = TestBed.createComponent(MainLayoutComponent);
    fixtureAuth.detectChanges();

    const selectEl = fixtureAuth.debugElement.query(
      By.css('#user-switcher-dropdown'),
    );
    expect(selectEl).toBeNull();
  });

  it('should show user-switcher-dropdown when auth configuration is provided for admin or support user', async () => {
    farmServiceSpy.getUser.and.returnValue(
      of({ id: 3, name: 'Support User', email: 'support@example.com', role: 'support' }),
    );
    authServiceSpy.getUserRoles.and.returnValue(['support']);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: {
            apiPath: '/api',
            logLevel: 'DEBUG',
            auth: { issuer: 'https://keycloak.example.com', clientId: 'test' },
          },
        },
        LoggerService,
        { provide: RxdbService, useValue: rxdbServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: FarmManagementService, useValue: farmServiceSpy },
        { provide: DevAuthApiService, useValue: devAuthApiSpy },
        { provide: SyncEngineService, useValue: syncEngineServiceSpy },
      ],
    }).compileComponents();

    const fixtureAuth = TestBed.createComponent(MainLayoutComponent);
    fixtureAuth.detectChanges();

    const selectEl = fixtureAuth.debugElement.query(
      By.css('#user-switcher-dropdown'),
    );
    expect(selectEl).toBeTruthy();
  });
});
