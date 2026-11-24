import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Search,
  LocateFixed,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';
import Button from '../../components/common/Button';
import FormField from '../../components/forms/FormField';
import { parseStoreMapLink } from '../../services/storeMapLink';

interface GoogleMapLocationPickerProps {
  latitude: string;
  longitude: string;
  radiusMeters: string;
  mapUrl?: string;
  onChange: (data: {
    latitude: string;
    longitude: string;
    radiusMeters: string;
    mapUrl?: string;
  }) => void;
}

const DEFAULT_CENTER: [number, number] = [17.385, 78.4867]; // Default to Hyderabad, India (SNR NEST default region)

function createCustomPinIcon() {
  return L.divIcon({
    className: 'custom-google-maps-pin',
    html: `
      <div style="transform: translate(-50%, -100%); pointer-events: none; display: flex; flex-direction: column; align-items: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 24" fill="#0284c7" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
          <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"></circle>
        </svg>
      </div>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  });
}

export default function GoogleMapLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  mapUrl = '',
  onChange,
}: GoogleMapLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedLat = parseFloat(latitude);
  const parsedLng = parseFloat(longitude);
  const hasValidCoords = !isNaN(parsedLat) && !isNaN(parsedLng);
  const currentRadius = parseInt(radiusMeters, 10) || 50;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = hasValidCoords ? parsedLat : DEFAULT_CENTER[0];
    const initialLng = hasValidCoords ? parsedLng : DEFAULT_CENTER[1];
    const initialZoom = hasValidCoords ? 16 : 13;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: initialZoom,
        zoomControl: true,
      });

      // Google Maps Roadmap tile layer
      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps',
      }).addTo(map);

      // Click listener to place/move the store pin
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clickedLat = Number(e.latlng.lat.toFixed(7));
        const clickedLng = Number(e.latlng.lng.toFixed(7));

        updatePosition(clickedLat, clickedLng);
        setStatusNotice(`Store location pin placed at: ${clickedLat}, ${clickedLng}`);
      });

      mapInstanceRef.current = map;

      // In case container had layout delay
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    } catch {
      // Graceful fallback for non-browser/test environments
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  // Update marker and circle whenever coordinates or radius change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hasValidCoords) {
      const latLng: [number, number] = [parsedLat, parsedLng];

      if (!markerRef.current) {
        const marker = L.marker(latLng, {
          icon: createCustomPinIcon(),
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const draggedLat = Number(pos.lat.toFixed(7));
          const draggedLng = Number(pos.lng.toFixed(7));
          updatePosition(draggedLat, draggedLng);
          setStatusNotice(`Pin moved to: ${draggedLat}, ${draggedLng}`);
        });

        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(latLng);
      }

      if (!circleRef.current) {
        circleRef.current = L.circle(latLng, {
          radius: currentRadius,
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.22,
          weight: 2,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latLng);
        circleRef.current.setRadius(currentRadius);
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    }
  }, [latitude, longitude, radiusMeters]);

  function updatePosition(lat: number, lng: number, customMapUrl?: string) {
    const latStr = String(lat);
    const lngStr = String(lng);
    setErrorMessage(null);

    onChange({
      latitude: latStr,
      longitude: lngStr,
      radiusMeters: radiusMeters || '50',
      mapUrl:
        customMapUrl !== undefined
          ? customMapUrl
          : mapUrl || `https://www.google.com/maps?q=${latStr},${lngStr}`,
    });

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
    }
  }

  // Address search using Nominatim
  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setSearching(true);
    setErrorMessage(null);
    setStatusNotice(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const foundLat = Number(parseFloat(data[0].lat).toFixed(7));
        const foundLng = Number(parseFloat(data[0].lon).toFixed(7));
        updatePosition(foundLat, foundLng);
        setStatusNotice(`Found: "${data[0].display_name}". Location pin set!`);
      } else {
        setErrorMessage(
          `Could not find "${query}". Try searching a city name or pasting a Google Maps link.`,
        );
      }
    } catch {
      setErrorMessage('Search request failed. Please check network or paste coordinates directly.');
    } finally {
      setSearching(false);
    }
  }

  // Browser GPS capture
  function handleUseGps() {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setErrorMessage(null);
    setStatusNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        updatePosition(lat, lng);
        setStatusNotice(
          `Current GPS captured: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m accuracy)`,
        );
      },
      (err) => {
        setLocating(false);
        setErrorMessage(`GPS error: ${err.message}. Please select your location on the map.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Handle pasted Google Maps URL
  function handlePasteMapLink(url: string) {
    setErrorMessage(null);
    setStatusNotice(null);
    onChange({
      latitude,
      longitude,
      radiusMeters,
      mapUrl: url,
    });

    if (!url.trim()) return;

    try {
      const parsed = parseStoreMapLink(url);
      if (parsed) {
        updatePosition(parsed.latitude, parsed.longitude, url);
        setStatusNotice(
          `Coordinates extracted from Google Maps link: ${parsed.latitude}, ${parsed.longitude}`,
        );
      } else {
        setErrorMessage(
          'Could not extract coordinates from link. Ensure it is a valid Google Maps pin or share URL.',
        );
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid map URL.');
    }
  }

  return (
    <div
      className="google-map-location-picker"
      style={{
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            color: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <MapPin size={17} style={{ color: '#0284c7' }} />
          Choose Store Location on Google Maps
        </span>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            type="button"
            onClick={() =>
              window.open(
                hasValidCoords
                  ? `https://www.google.com/maps?q=${parsedLat},${parsedLng}`
                  : 'https://www.google.com/maps',
                '_blank',
              )
            }
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            <ExternalLink size={13} />
            Open Google Maps
          </Button>

          <Button
            variant="secondary"
            type="button"
            onClick={handleUseGps}
            disabled={locating}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            <LocateFixed size={13} className={locating ? 'animate-spin' : ''} />
            {locating ? 'Locating…' : 'Use Current GPS'}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Search address, landmark, mall, or city (e.g. Inorbit Mall Hyderabad, MG Road Bangalore)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
            }}
          />
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              pointerEvents: 'none',
            }}
          />
        </div>
        <Button
          variant="primary"
          type="button"
          onClick={() => handleSearch()}
          disabled={searching || !searchQuery.trim()}
          style={{ fontSize: '0.8rem', padding: '0.55rem 0.9rem' }}
        >
          {searching ? 'Searching…' : 'Find on Map'}
        </Button>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div
        style={{
          position: 'relative',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #94a3b8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <div
          ref={mapContainerRef}
          style={{
            height: '240px',
            width: '100%',
            background: '#e2e8f0',
          }}
        />

        {/* Floating Instruction Banner over map */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            right: '8px',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(4px)',
            padding: '0.35rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          <span>
            👉 <strong>Click anywhere on map</strong> to drop/move the store pin, or drag the blue
            marker.
          </span>
          {hasValidCoords && (
            <span style={{ fontWeight: 600, color: '#0284c7' }}>Geofence: ±{currentRadius}m</span>
          )}
        </div>
      </div>

      {/* Paste Google Maps Link Option */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="url"
            placeholder="Or paste Google Maps URL (e.g. https://maps.app.goo.gl/... or https://maps.google.com/?q=...)"
            value={mapUrl}
            onChange={(e) => handlePasteMapLink(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.8125rem',
              background: '#ffffff',
            }}
          />
          <LinkIcon
            size={14}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              pointerEvents: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          You can also copy the share link directly from Google Maps app or browser and paste it
          here.
        </span>
      </div>

      {/* Status Notice */}
      {statusNotice && (
        <div
          style={{
            padding: '0.45rem 0.75rem',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '6px',
            color: '#065f46',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <CheckCircle2 size={15} />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            padding: '0.45rem 0.75rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#b91c1c',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Fine-tuning coordinates & radius */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <FormField
          label="Latitude"
          type="text"
          placeholder="e.g. 17.4435"
          value={latitude}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            onChange({ latitude: val, longitude, radiusMeters, mapUrl });
          }}
          hint="Auto-filled from map"
        />
        <FormField
          label="Longitude"
          type="text"
          placeholder="e.g. 78.3772"
          value={longitude}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            onChange({ latitude, longitude: val, radiusMeters, mapUrl });
          }}
          hint="Auto-filled from map"
        />
        <FormField
          label="Radius (meters)"
          type="number"
          placeholder="50"
          value={radiusMeters}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            onChange({ latitude, longitude, radiusMeters: val, mapUrl });
          }}
          hint="Geofence boundary"
        />
      </div>
    </div>
  );
}
