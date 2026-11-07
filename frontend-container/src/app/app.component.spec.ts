import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { Location } from '@angular/common';
import { AuthService } from './services/auth.service';
import { VersionUpdateService } from './services/version-update.service';
import { APP_CONFIG } from './app-config';

// No obvious PRD requirement
describe('AppComponent Routing', () => {
  let mockAuthService: jasmine.SpyObj<AuthService>;

  // No obvious PRD requirement
  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', [
      'isLoggedIn',
      'getUserId',
    ]);
    mockAuthService.isLoggedIn.and.returnValue(true);
    mockAuthService.getUserId.and.returnValue('1');

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ActivatedRoute, useValue: {} },
        // No obvious PRD requirement
        provideRouter(routes),
        { provide: AuthService, useValue: mockAuthService },
        { provide: VersionUpdateService, useValue: {} },
        { provide: APP_CONFIG, useValue: { apiPath: '/api', logLevel: 'DEBUG' } },
      ],
    }).compileComponents();
  });

  // No obvious PRD requirement
  it('should redirect to /home on empty path', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);

    // Initial navigation
    await router.navigate(['']);
    // No obvious PRD requirement
    expect(location.path()).toBe('/home');
  });

  // No obvious PRD requirement
  it('should redirect to /home on unknown path', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);

    await router.navigate(['/some-unknown-path']);
    // No obvious PRD requirement
    expect(location.path()).toBe('/home');
  });
});
