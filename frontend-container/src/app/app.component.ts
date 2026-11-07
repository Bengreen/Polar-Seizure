import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { SyncEngineService } from './services/sync-engine.service';
import { VersionUpdateService } from './services/version-update.service';
import * as L from 'leaflet';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'SwardWarden';

  constructor(
    private syncEngine: SyncEngineService,
    private versionUpdateService: VersionUpdateService
  ) {
    this.initLeafletIcons();
  }

  // PRD Reference: 0003
  private initLeafletIcons() {
    const iconRetinaUrl = '/assets/leaflet/marker-icon-2x.png';
    const iconUrl = '/assets/leaflet/marker-icon.png';
    const shadowUrl = '/assets/leaflet/marker-shadow.png';

    const iconDefault = L.icon({
      iconRetinaUrl,
      iconUrl,
      shadowUrl,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });

    L.Marker.prototype.options.icon = iconDefault;
  }
}
