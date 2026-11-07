import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { HomeComponent } from './home.component';
import { LoggerService } from '../services/logger.service';
import { APP_CONFIG } from '../app-config';
import { FarmManagementService } from '../services/farm-management.service';
import { AuthService } from '../services/auth.service';
import { of } from 'rxjs';

// No obvious PRD requirement
describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mockFarmService: jasmine.SpyObj<FarmManagementService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  // No obvious PRD requirement
  beforeEach(async () => {
    mockFarmService = jasmine.createSpyObj('FarmManagementService', [
      'getUser',
      'getFarms',
    ]);
    mockFarmService.getUser.and.returnValue(
      of({ id: 1, name: 'Test User', email: 'test@example.com' }),
    );
    mockFarmService.getFarms.and.returnValue(of([]));

    mockAuthService = jasmine.createSpyObj('AuthService', ['getUserId']);
    mockAuthService.getUserId.and.returnValue('1');

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: ActivatedRoute, useValue: {} },
        // No obvious PRD requirement
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiPath: "/api", logLevel: "DEBUG" } },
        LoggerService,
        { provide: FarmManagementService, useValue: mockFarmService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // No obvious PRD requirement
  it('should create', () => {
    // No obvious PRD requirement
    expect(component).toBeTruthy();
  });

  // No obvious PRD requirement
  it('should display the user profile section', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    // No obvious PRD requirement
    expect(compiled.textContent).toContain('Command Center');
  });
});
