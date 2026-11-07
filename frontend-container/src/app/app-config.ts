import { InjectionToken } from '@angular/core';

export interface OTelConfig {
  collectorUrl: string;
  logLevel: string;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  scope: string;
  requireHttps?: boolean;
  skipIssuerCheck?: boolean;
}

export interface AppConfig {
  apiPath: string;
  otel?: OTelConfig;
  logLevel: string;
  auth?: OidcConfig;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
