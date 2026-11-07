import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

import { APP_CONFIG, AppConfig } from '../app-config';
import { Inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpatialService {
  constructor(
    private http: HttpClient,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}

  // No obvious PRD requirement
  private get apiUrl() {
    return `${this.config.apiPath}/v0/spatial`;
  }

  // No obvious PRD requirement
  getWaterwayBuffers(distance: number): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/waterway-buffers?distance=${distance}`,
    );
  }

  // PRD Reference: 0008
  calculateAreaFromPolygon(geojson: string): Observable<{ area_sq_meters: number }> {
    return this.http.post<{ area_sq_meters: number }>(
      `${this.apiUrl}/area-from-poly`,
      { geojson }
    );
  }
}
