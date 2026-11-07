import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  provideHttpClient,
  withInterceptors,
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RxdbService } from './rxdb/rxdb.service';

import { devAuthInterceptor } from './dev-auth.interceptor';

// PRD Reference: 0014
describe('devAuthInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let routerSpy: jasmine.SpyObj<Router>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let rxdbServiceSpy: jasmine.SpyObj<RxdbService>;

  // PRD Reference: 0014
  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['getToken', 'logout', 'initCodeFlow']);
    rxdbServiceSpy = jasmine.createSpyObj('RxdbService', ['wipeDatabase']);
    rxdbServiceSpy.wipeDatabase.and.returnValue(Promise.resolve());
    authServiceSpy.getToken.and.returnValue('real-test-token');

    TestBed.configureTestingModule({
      providers: [
        // PRD Reference: 0014
        provideHttpClient(withInterceptors([devAuthInterceptor])),
        // PRD Reference: 0014
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: RxdbService, useValue: rxdbServiceSpy },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  // PRD Reference: 0014
  afterEach(() => {
    httpMock.verify();
  });

  // PRD Reference: 0014
  it('should add a fake JWT if Authorization header is missing', () => {
    httpClient.get('/test-endpoint').subscribe();

    const req = httpMock.expectOne('/test-endpoint');
    // PRD Reference: 0014
    expect(req.request.headers.has('Authorization')).toBeTrue();
    // PRD Reference: 0014
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer real-test-token',
    );

    req.flush({});
  });

  // PRD Reference: 0014
  it('should not add a fake JWT if Authorization header is present', () => {
    httpClient
      .get('/test-endpoint', {
        headers: { Authorization: 'Bearer real-token' },
      })
      .subscribe();

    const req = httpMock.expectOne('/test-endpoint');
    // PRD Reference: 0014
    expect(req.request.headers.get('Authorization')).toBe('Bearer real-token');
    req.flush({});
  });

  // PRD Reference: 0014
  it('should logout and navigate to /login on 401 response when not using OIDC auth config', async () => {
    httpClient.get('/test-endpoint').subscribe({
      next: () => fail('should have failed with 401'),
      error: (error: HttpErrorResponse) => {
        // PRD Reference: 0014
        expect(error.status).toBe(401);
      },
    });

    const req = httpMock.expectOne('/test-endpoint');
    req.flush(
      { error: 'Unauthorized Access' },
      { status: 401, statusText: 'Unauthorized' },
    );

    // PRD Reference: 0014
    await new Promise(resolve => setTimeout(resolve, 0)); // wait for finally
    expect(rxdbServiceSpy.wipeDatabase).toHaveBeenCalled();
    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  // PRD Reference: 0014
  it('should navigate to /error with correct state on 403 response when token exists', () => {
    authServiceSpy.getToken.and.returnValue('valid-token');

    httpClient.get('/test-endpoint').subscribe({
      next: () => fail('should have failed with 403'),
      error: (error: HttpErrorResponse) => {
        // PRD Reference: 0014
        expect(error.status).toBe(403);
      },
    });

    const req = httpMock.expectOne('/test-endpoint');
    req.flush(
      { error: 'Forbidden Access' },
      { status: 403, statusText: 'Forbidden' },
    );

    // PRD Reference: 0014
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/error'], {
      state: { error: 'Forbidden Access' },
    });
  });

  // PRD Reference: 0014
  it('should pass through other errors without navigation', () => {
    httpClient.get('/test-endpoint').subscribe({
      next: () => fail('should have failed with 500'),
      error: (error: HttpErrorResponse) => {
        // PRD Reference: 0014
        expect(error.status).toBe(500);
      },
    });

    const req = httpMock.expectOne('/test-endpoint');
    req.flush('Internal Server Error', {
      status: 500,
      statusText: 'Server Error',
    });

    // PRD Reference: 0014
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });
});
