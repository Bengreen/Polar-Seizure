import { LoggerService } from '../../../services/logger.service';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
// @ts-ignore
import { GeoSearchControl, EsriProvider } from 'leaflet-geosearch';

@Component({
  selector: 'app-field-map-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="map-container relative w-full max-w-full h-[400px] border border-outline rounded-md overflow-hidden"
    >
      <div #mapElement class="w-full h-full"></div>
      <div
        class="absolute top-2 right-2 z-[1000] bg-surface rounded shadow p-2 flex flex-col gap-2"
        *ngIf="isEditMode"
      >
        <button
          type="button"
          class="px-2 py-1 bg-primary text-on-primary text-xs rounded hover:bg-primary/90"
          (click)="autoDetectStub()"
        >
          Auto-Detect (Stub)
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      /* Ensure Leaflet controls stay above other map elements but below modals */
      ::ng-deep .leaflet-control-container .leaflet-top,
      ::ng-deep .leaflet-control-container .leaflet-bottom {
        z-index: 999;
      }
    `,
  ],
})
export class FieldMapEditorComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('mapElement') mapElement!: ElementRef;

  @Input() geojson: string = '';
  @Input() isEditMode: boolean = true;
  @Input() readonly: boolean = false;
  @Output() geojsonChange = new EventEmitter<string>();

  private map!: L.Map;
  private currentLayer: L.Layer | null = null;

  constructor(private logger: LoggerService) {}

  // PRD Reference: 0003
  ngOnInit() {}

  // PRD Reference: 0003
  ngAfterViewInit() {
    this.initMap();
    if (this.geojson) {
      this.loadGeoJson(this.geojson);
    }

    if (this.isEditMode && !this.readonly) {
      this.setupGeoman();
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 200);
  }

  // PRD Reference: 0003
  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  // PRD Reference: 0003
  private initMap(): void {
    this.map = L.map(this.mapElement.nativeElement, {
      center: [54.5, -6.5], // Default center
      zoom: 13,
    });

    const streetMap = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 18,
        minZoom: 3,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    );

    const satelliteMap = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 18,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      },
    );

    streetMap.addTo(this.map);
    const baseMaps = {
      "Street Map": streetMap,
      "Satellite Map": satelliteMap
    };

    L.control.layers(baseMaps).addTo(this.map);
    const provider = new EsriProvider();
    const searchControl = new (GeoSearchControl as any)({
      provider: provider,
      style: 'bar',
      autoComplete: true,
      autoCompleteDelay: 250,
      showMarker: false,
      retainZoomLevel: false,
      animateZoom: true,
      keepResult: true,
      searchLabel: 'Enter address or location',
    });

    this.map.addControl(searchControl);
  }

  // PRD Reference: 0003
  private setupGeoman(): void {
    this.map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: true,
      drawMarker: true,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      rotateMode: false,
    });

    // Only allow drawing one polygon at a time
    this.map.on('pm:create', (e) => {
      if (this.currentLayer) {
        this.map.removeLayer(this.currentLayer);
      }
      this.currentLayer = e.layer;
      this.updateGeoJsonFromLayer(this.currentLayer);

      // Listen for updates on the new layer
      this.currentLayer.on('pm:update', () =>
        this.updateGeoJsonFromLayer(this.currentLayer!),
      );
    });

    this.map.on('pm:remove', (e) => {
      if (this.currentLayer === e.layer) {
        this.currentLayer = null;
        this.geojsonChange.emit('');
      }
    });
  }

  // PRD Reference: 0003
  private loadGeoJson(geoJsonString: string): void {
    try {
      const geojsonObj = JSON.parse(geoJsonString);

      const layer = L.geoJSON(geojsonObj, {
        style: {
          color: '#1976d2',
          weight: 2,
          opacity: 0.8,
          fillColor: '#1976d2',
          fillOpacity: 0.3,
        },
      });

      if (this.currentLayer) {
        this.map.removeLayer(this.currentLayer);
      }

      layer.addTo(this.map);
      this.map.fitBounds(layer.getBounds(), { maxZoom: 16 });

      const layers = layer.getLayers();
      if (layers.length > 0) {
        this.currentLayer = layers[0];
        if (this.isEditMode && !this.readonly) {
          this.currentLayer.on('pm:update', () =>
            this.updateGeoJsonFromLayer(this.currentLayer!),
          );
        }
      }
    } catch (e) {
      this.logger.error('Invalid GeoJSON string', e);
    }
  }

  // PRD Reference: 0003
  private updateGeoJsonFromLayer(layer: L.Layer): void {
    try {
      let geojson;
      if (typeof (layer as any).toGeoJSON === 'function') {
        geojson = (layer as any).toGeoJSON();
      }

      if (geojson) {
        const geom = geojson.geometry || geojson;
        this.geojsonChange.emit(JSON.stringify(geom));
      }
    } catch (e) {
      this.logger.error('Error generating GeoJSON from layer', e);
    }
  }

  // Auto-detection using Overpass API
  // PRD Reference: 0008
  async autoDetectStub(): Promise<void> {
    const center = this.map.getCenter();
    const query = `[out:json];(way["landuse"](around:50,${center.lat},${center.lng});relation["landuse"](around:50,${center.lat},${center.lng}););out geom;`;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.elements && data.elements.length > 0) {
        const element = data.elements[0];
        let latlngs: L.LatLngExpression[] | L.LatLngExpression[][] = [];

        if (element.type === 'way' && element.geometry) {
          latlngs = element.geometry.map((node: any) => [node.lat, node.lon] as L.LatLngExpression);
        } else if (element.type === 'relation' && element.members) {
           // Basic relation handling - grab the outer ways
           const relationLatLngs: L.LatLngExpression[][] = [];
           for (const member of element.members) {
             if (member.type === 'way' && member.role === 'outer' && member.geometry) {
                relationLatLngs.push(member.geometry.map((node: any) => [node.lat, node.lon] as L.LatLngExpression));
             }
           }
           latlngs = relationLatLngs;
        }

        if (latlngs.length > 0) {
          if (this.currentLayer) {
            this.map.removeLayer(this.currentLayer);
          }

          const polygon = L.polygon(latlngs, {
            color: '#1976d2',
            weight: 2,
            opacity: 0.8,
            fillColor: '#1976d2',
            fillOpacity: 0.3,
          });

          polygon.addTo(this.map);
          this.currentLayer = polygon;
          this.updateGeoJsonFromLayer(polygon);

          if (this.isEditMode && !this.readonly) {
            this.currentLayer.on('pm:update', () =>
              this.updateGeoJsonFromLayer(this.currentLayer!),
            );
          }
          this.map.fitBounds(polygon.getBounds());
          return;
        }
      }

      this.logger.log('No agricultural field boundary found at this location.');
      alert('No field boundary could be automatically detected at this location.');

    } catch (error) {
      this.logger.error('Error fetching data from Overpass API:', error);
      alert('Failed to auto-detect boundary. Please try again or draw manually.');
    }
  }
}
