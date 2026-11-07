import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// No obvious PRD requirement
fetch('/assets/contents/app-config.json')
  .then((res) => res.json())
  .then((config) => {
    // No obvious PRD requirement
    bootstrapApplication(AppComponent, createAppConfig(config)).catch((err) =>
      console.error(err),
    );
  })
  .catch((err) => {
    console.error('Failed to load application configuration', err);
  });
