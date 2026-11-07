import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OptimizationSuggestion {
  field_id: number;
  field_name: string;
  recommended_rate: number;
  unit: string;
  nutrient_met: string;
  score: number;
  reasoning: string;
}

export interface OptimizationPlan {
  farm_id: number;
  suggestions: OptimizationSuggestion[];
}

import { APP_CONFIG, AppConfig } from '../app-config';
import { Inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class OptimizationService {
  constructor(
    private http: HttpClient,
    @Inject(APP_CONFIG) private config: AppConfig,
  ) {}

  // No obvious PRD requirement
  private get apiUrl() {
    return `${this.config.apiPath}/v0/optimization`;
  }

  // No obvious PRD requirement
  getSuggestions(farmId: number): Observable<OptimizationPlan> {
    return this.http.get<OptimizationPlan>(
      `${this.apiUrl}/suggestions/${farmId}`,
    );
  }
}
