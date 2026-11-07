import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { APP_CONFIG } from '../app-config';

import { WeatherService } from './weather.service';

// PRD Reference: 0008
describe('WeatherService', () => {
  let service: WeatherService;

  // PRD Reference: 0008
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // PRD Reference: 0008
        provideHttpClient(),
        // PRD Reference: 0008
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiPath: '/api', logLevel: 'INFO' },
        },
      ],
    });
    service = TestBed.inject(WeatherService);
  });

  // PRD Reference: 0008
  it('should be created', () => {
    // PRD Reference: 0008
    expect(service).toBeTruthy();
  });
});
