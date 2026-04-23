import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators, FormControl, FormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapDirectionsRenderer, MapMarker } from '@angular/google-maps';
import { MatIconModule } from '@angular/material/icon';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';

let isScriptLoaded = false;
let apiLoadingPromise: Promise<void> | null = null;

function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (isScriptLoaded) return Promise.resolve();
  if (apiLoadingPromise) return apiLoadingPromise;

  apiLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      isScriptLoaded = true;
      resolve();
    };
    script.onerror = (error) => reject(error);
    document.body.appendChild(script);
  });

  return apiLoadingPromise;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [ReactiveFormsModule, GoogleMap, MapDirectionsRenderer, MatIconModule, MapMarker, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  isMapReady = signal(false);
  directionsResult = signal<google.maps.DirectionsResult | undefined>(undefined);
  distance = signal<string>('');
  duration = signal<string>('');

  form = this.fb.group({
    stops: this.fb.array([
      this.fb.control('', Validators.required),
      this.fb.control('', Validators.required)
    ]),
    travelMode: ['DRIVING', Validators.required]
  });

  get stops() {
    return this.form.get('stops') as FormArray<FormControl<string | null>>;
  }

  isMinimalView = signal(false);
  isConfigured = signal(true); // Will set to false if API key is missing
  showApiKeyDialog = signal(false);
  customApiKeyControl = new FormControl('');
  
  isTracking = signal(false);
  currentPosition = signal<google.maps.LatLngLiteral | null>(null);
  geoError = signal<string | null>(null);
  mapCenter = signal<google.maps.LatLngLiteral>({ lat: 39.8283, lng: -98.5795 });
  
  private watchId: number | null = null;
  private lastCalcPos: google.maps.LatLngLiteral | null = null;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
  };

  ngOnDestroy() {
    if (this.watchId !== null && isPlatformBrowser(this.platformId)) {
      navigator.geolocation.clearWatch(this.watchId);
    }
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedKey = localStorage.getItem('CUSTOM_GOOGLE_MAPS_API_KEY');
      if (savedKey) {
        this.customApiKeyControl.setValue(savedKey);
      }
      
      this.initMap();

      this.route.queryParams.subscribe(params => {
        if (params['minimal'] === 'true') {
          this.isMinimalView.set(true);
        } else {
          this.isMinimalView.set(false);
        }

        if (params['origin'] && params['destination']) {
          const wps = params['waypoints'] ? params['waypoints'].split('|') : [];
          this.stops.clear();
          this.stops.push(this.fb.control(params['origin'], Validators.required));
          wps.forEach((w: string) => this.stops.push(this.fb.control(w, Validators.required)));
          this.stops.push(this.fb.control(params['destination'], Validators.required));

          this.form.patchValue({
            travelMode: params['travelMode'] || 'DRIVING'
          });
          
          if (this.isMapReady()) {
            this.calculateRoute();
          }
        }
      });
    }
  }

  async initMap() {
    try {
      let apiKey = localStorage.getItem('CUSTOM_GOOGLE_MAPS_API_KEY');
      
      if (!apiKey) {
        const config = await firstValueFrom(this.http.get<{googleMapsApiKey: string}>('/api/config'));
        apiKey = config.googleMapsApiKey;
      }
      
      if (!apiKey) {
        this.isConfigured.set(false);
        this.showApiKeyDialog.set(true);
        return;
      }

      await loadGoogleMapsApi(apiKey);
      this.isMapReady.set(true);

      // If form already has values from query params
      if (this.form.valid) {
        this.calculateRoute();
      }
    } catch (e) {
      console.error('Failed to load Google Maps:', e);
    }
  }

  saveCustomApiKey() {
    const key = this.customApiKeyControl.value;
    if (key && key.trim()) {
      localStorage.setItem('CUSTOM_GOOGLE_MAPS_API_KEY', key.trim());
      window.location.reload();
    }
  }

  clearCustomApiKey() {
    localStorage.removeItem('CUSTOM_GOOGLE_MAPS_API_KEY');
    this.customApiKeyControl.setValue('');
    window.location.reload();
  }

  submit() {
    if (this.form.valid) {
      const val = this.form.getRawValue();
      const stps = val.stops as string[];
      
      const queryParams: any = {
        travelMode: val.travelMode
      };
      
      if (stps.length >= 1) queryParams.origin = stps[0];
      if (stps.length >= 2) queryParams.destination = stps[stps.length - 1];
      if (stps.length > 2) queryParams.waypoints = stps.slice(1, stps.length - 1).join('|');

      // Update URL parameters
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
      });
      this.calculateRoute();
    }
  }

  addStop() {
    this.stops.push(this.fb.control('', Validators.required));
  }

  removeStop(index: number) {
    if (this.stops.length > 2) {
      this.stops.removeAt(index);
      if (this.isMapReady()) this.calculateRoute();
    }
  }

  drop(event: CdkDragDrop<any>) {
    const dirArr = this.stops;
    const current = dirArr.at(event.previousIndex);
    dirArr.removeAt(event.previousIndex);
    dirArr.insert(event.currentIndex, current);
    
    if (this.isMapReady() && this.form.valid) {
      this.calculateRoute();
    }
  }

  apiError = signal<string | null>(null);

  calculateRoute() {
    if (!this.isMapReady() || !this.form.valid) return;

    this.apiError.set(null); // Clear previous errors
    const val = this.form.getRawValue();
    const stps = val.stops as string[];
    
    if (stps.length < 2) return;

    const directionsService = new google.maps.DirectionsService();

    const origin = stps[0];
    const destination = stps[stps.length - 1];
    const waypoints = stps.slice(1, stps.length - 1).map(loc => ({
      location: loc,
      stopover: true
    }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: val.travelMode as google.maps.TravelMode,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          this.directionsResult.set(result);

          // Get total distance and duration of all legs
          const route = result.routes[0];
          if (route && route.legs && route.legs.length > 0) {
            let totalDistance = 0;
            let totalDuration = 0;
            for (const leg of route.legs) {
              totalDistance += leg.distance?.value || 0;
              totalDuration += leg.duration?.value || 0;
            }
            
            // Format total metrics
            const distMiles = (totalDistance / 1609.34).toFixed(1) + ' mi';
            const hours = Math.floor(totalDuration / 3600);
            const mins = Math.floor((totalDuration % 3600) / 60);
            const durText = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

            this.distance.set(distMiles);
            this.duration.set(durText);
          }
        } else {
          console.error('Directions request failed due to ' + status);
          if (status === google.maps.DirectionsStatus.REQUEST_DENIED) {
            this.apiError.set(
              'REQUEST_DENIED: Google rejected the request. Please verify three things in your Google Cloud Console:\n' +
              '1. Both the "Directions API" AND "Geocoding API" are enabled (Geocoding is needed to resolve text addresses).\n' +
              '2. You have an active Billing Account linked to your Google Cloud Project (required by Google).\n' +
              '3. If you added "Application Restrictions" (HTTP Referrers) to your API Key, ensure they aren\'t blocking this app.'
            );
          } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
             this.apiError.set('ZERO_RESULTS: No route could be found between the origin and destination.');
          } else if (status === google.maps.DirectionsStatus.NOT_FOUND) {
             this.apiError.set('NOT_FOUND: The origin and/or destination address could not be geocoded. Try being more specific.');
          } else {
            this.apiError.set('Directions request failed with status: ' + status);
          }
          // Clear current route on error
          this.directionsResult.set(undefined);
          this.distance.set('');
          this.duration.set('');
        }
      }
    );
  }

  getDynamicMarkerOptions() {
    if (!this.isMapReady()) return {};
    return {
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#3b82f6', // blue-500
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      title: 'Current Location',
      zIndex: 999
    };
  }

  toggleTracking() {
    if (this.isTracking()) {
      this.stopTracking();
    } else {
      this.startTracking();
    }
  }

  startTracking() {
    if (!isPlatformBrowser(this.platformId) || !navigator.geolocation) {
      this.geoError.set("Geolocation is not supported by your browser.");
      return;
    }
    
    this.isTracking.set(true);
    this.geoError.set(null);
    this.stops.at(0).disable();
    
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.currentPosition.set(coords);
        this.mapCenter.set(coords); // Update map center
        
        const currentStops = this.stops.getRawValue() as string[];
        const hasDest = !!currentStops[currentStops.length - 1];
        
        if (hasDest) {
          // Recalculate route if moved > 20 meters
          if (!this.lastCalcPos || this.calcDistance(this.lastCalcPos, coords) > 20) {
            this.lastCalcPos = coords;
            this.stops.at(0).setValue(`${coords.lat},${coords.lng}`);
            this.calculateRoute();
          }
        } else {
          this.stops.at(0).setValue(`${coords.lat},${coords.lng}`);
        }
      },
      (err) => {
        this.geoError.set(`Tracking error: ${err.message}`);
        this.stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  stopTracking() {
    this.isTracking.set(false);
    this.stops.at(0).enable();
    if (this.watchId !== null && isPlatformBrowser(this.platformId)) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  calcDistance(p1: google.maps.LatLngLiteral, p2: google.maps.LatLngLiteral) {
    const R = 6371e3;
    const f1 = p1.lat * Math.PI/180;
    const f2 = p2.lat * Math.PI/180;
    const df = (p2.lat-p1.lat) * Math.PI/180;
    const dl = (p2.lng-p1.lng) * Math.PI/180;

    const a = Math.sin(df/2) * Math.sin(df/2) +
              Math.cos(f1) * Math.cos(f2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  getMapsDeepLink(): string | null {
    const val = this.form.getRawValue();
    const stps = val.stops as string[];
    
    if (stps.length < 2 || !stps[0] || !stps[stps.length - 1]) return null;

    const origin = encodeURIComponent(stps[0]);
    const destination = encodeURIComponent(stps[stps.length - 1]);
    const waypoints = stps.slice(1, stps.length - 1).filter(Boolean).map(v => encodeURIComponent(v)).join('%7C');
    const mode = (val.travelMode || 'DRIVING').toLowerCase();

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }

    return url;
  }
}
