import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { APP_CONFIG } from '../app-config';

import { SpatialService } from './spatial.service';

// No obvious PRD requirement
describe('SpatialService', () => {
  let service: SpatialService;

  // No obvious PRD requirement
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // No obvious PRD requirement
        provideHttpClient(),
        // No obvious PRD requirement
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiPath: '/api', logLevel: 'INFO' },
        },
      ],
    });
    service = TestBed.inject(SpatialService);
  });

  // No obvious PRD requirement
  it('should be created', () => {
    // No obvious PRD requirement
    expect(service).toBeTruthy();
  });
});
