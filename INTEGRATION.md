# GeoTrack Pro Sub-Module Integration Guide

**GeoTrack Pro** is an autonomous, scalable mapping and routing micro-frontend. It has been engineered specifically to act as an easily integratable sub-module for other websites, web apps, autonomous agents, and mobile contexts. 

Instead of reinventing Google Maps integration, other developers and Agents can simply embed this app as an `<iframe>`.

---

## 1. Web / Agent iframe Embedding API

Any external web application or AI Agent can instantly provision a live tracking UI by generating an iframe with a dynamically constructed URL.

### Basic Embed Format
```html
<iframe 
  src="https://{YOUR_GEOTRACK_PRO_URL}/?origin={ORIGIN}s&destination={DESTINATION}&waypoints={WAYPOINTS}&travelMode={MODE}" 
  width="100%" 
  height="700px" 
  allow="geolocation" 
  style="border:none; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
</iframe>
```
*Note: `allow="geolocation"` is strictly required for the Live GPS Tracking sub-feature to authorize device sensors.*

### The URL Query Parameters (Input Protocol)
This sub-module synchronizes its entire multi-stop state directly with the URL query parameters upon load. Values MUST be URI string-encoded.

| Parameter | Required | Description | Example String |
| :--- | :--- | :--- | :--- |
| `origin` | Yes | Start address, landmark, or lat/lng. | `origin=Golden+Gate+Bridge` |
| `destination`| Yes | End address, landmark, or lat/lng. | `destination=San+Jose,+CA` |
| `waypoints`  | No  | Intermediate stops, **separated by a pipe (`\|`)**. | `waypoints=Palo+Alto\|Cupertino` |
| `travelMode` | No  | Mode options: `DRIVING`, `WALKING`, `BICYCLING`, `TRANSIT`. Defaults to `DRIVING`. | `travelMode=WALKING` |

---

## 2. Advanced Sub-Module Features

GeoTrack Pro automatically bootstraps several advanced routing systems internally, so the parent host application doesn't have to:

### A. Drag-and-Drop Reordering
If a user realizes a waypoint sequence is inefficient, they can use the grip handle inside the sidebar UI to drag inputs. Dropping them instantly recomputes the fastest distance and redraws the UI, completely isolated from the parent host.

### B. Live GPS "Follow-Me" Tracking
A user inside the iframe can toggle "Live GPS Tracking". 
* It natively interfaces with the `navigator.geolocation` browser API.
* It overrides the `origin` with real-time latitude/longitude coordinates.
* It implements throttle protections—only making new Google Directions API sub-requests if the user has physically moved >20 meters.

### C. Native Mobile Deep-Linking (Hand-off)
If your host application is being viewed on a mobile device (iOS/Android) within a web browser, the user can click the **"Open in Google Maps App"** button at the bottom of the sidebar.
* The sub-module automatically serializes the entire route (including waypoints) into the `google.maps.dir/?api=1` URI schema.
* Clicking it acts as an Intent that explicitly wakes the native iOS Apple Maps or Android Google Maps operating system application and hands off the navigation instructions.

---

## 3. Server Monitoring & Sub-Module Health

Before a parent Agent or Dashboard injects the GeoTrack Pro `<iframe>` into a view, it can cryptographically verify that the tracking service is online and possesses a valid Map Key.

**Endpoint:** `GET /api/health`

**Success Response (HTTP 200):**
```json
{
  "status": "ok",
  "timestamp": "2026-04-23T08:15:00.000Z",
  "configuration": {
    "hasDefaultMapsKey": true 
  }
}
```
*If `hasDefaultMapsKey` is true, the sub-module is entirely ready to receive URL queries without asking the end-user for API credentials.*

---

## 4. Cross-Framework Modularity

Because GeoTrack Pro uses an isolated Micro-Frontend (`<iframe>`) architecture powered by URL query parameters, it is **100% framework-agnostic**. It strictly avoids "dependency hell". Your parent application does not need to install `@angular/core`, `@google/maps`, or manage Webpack/Vite bundler conflicts.

You can drop it directly into **React, Next.js, Vue, Svelte, or native Vanilla HTML** apps natively.

### React / Next.js Implementation Example
Create a wrapper component inside your React codebase that simply handles URI construction:

```tsx
import React from 'react';

export default function GeoTrackWidget({ origin, destination, waypoints }) {
  // Construct the secure URL with encoded strings
  const wpsParam = waypoints ? `&waypoints=${waypoints.map(w => encodeURIComponent(w)).join('%7C')}` : '';
  const mapUrl = `https://{YOUR_GEOTRACK_PRO_URL}/?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${wpsParam}`;
  
  return (
    <div style={{ height: '700px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <iframe 
        src={mapUrl}
        width="100%" 
        height="100%" 
        allow="geolocation" 
        style={{ border: 'none' }}
        title="GeoTrack Pro Route GPS Tracker"
      />
    </div>
  );
}
```

### Native HTML / Content Management Systems (CMS)
For plain websites, WordPress, Webflow, or Shopify, no build tools are required. Just copy and paste this code block directly into your page's HTML structure:

```html
<div class="tracker-container">
  <iframe 
    src="https://{YOUR_GEOTRACK_PRO_URL}/?origin=Paris,+France&destination=Lyon,+France" 
    width="100%" 
    height="700px" 
    allow="geolocation" 
    style="border:none; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
  </iframe>
</div>
```
