import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection } from 'geojson';
import { apiWildfires } from '../../utils/apiWildfires';
import { readCountriesGeoJson } from '../../utils/wildfireDb';
import { COLORS } from '../../constants/colors';

const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';

export interface IMapCoords {
  lat: number;
  lng: number;
}

export interface MapMarkerDetails extends IMapCoords {
  location?: string;
  temperature?: { value: number; units: string } | null;
  wind_speed?: { value: number; units: string } | null;
  daysSinceRain?: number | null;
}

// const P2COORDS: IMapCoords = { lat: -10, lng: -78.3355236 };
const P2COORDS: IMapCoords = {
  lat: 3,
  lng: -80,
};
const DEFAULT_GLOBAL_ZOOM = 2;
const REGION_CODE = 'AMERICAS' as const;
const AUTO_ROTATION_DEG_PER_SEC = 3;

const normalizeLongitude = (lng: number) => {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
};

export const MBox = ({
  isLargeScreen,
  setIsLoading,
  focusCoords,
  marker,
  numberOfDays,
  startDate,
  onObservationCountChange,
}: {
  isLargeScreen: boolean;
  setIsLoading: (loading: boolean) => void;
  focusCoords: IMapCoords | null;
  marker: MapMarkerDetails | null;
  numberOfDays: string;
  startDate: string;
  onObservationCountChange?: (count: number | null) => void;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveData, setLiveData] = useState<FeatureCollection | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const rotationFrameRef = useRef<number | null>(null);
  const rotationLastTimestampRef = useRef<number | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const updateObservationCount = useCallback(
    (collection: FeatureCollection | null | undefined) => {
      if (!onObservationCountChange) {
        return;
      }

      if (
        collection &&
        collection.type === 'FeatureCollection' &&
        Array.isArray(collection.features)
      ) {
        onObservationCountChange(collection.features.length);
      } else {
        onObservationCountChange(null);
      }
    },
    [onObservationCountChange]
  );

  const setMapData = useCallback(
    async (map: mapboxgl.Map) => {
      const americasSource = map.getSource(
        'wildfires-americas'
      ) as mapboxgl.GeoJSONSource;
      if (!americasSource) return;
      const fetchKey = `${startDate}|${numberOfDays}`;
      if (
        liveData &&
        liveData.type === 'FeatureCollection' &&
        lastFetchKeyRef.current === fetchKey
      ) {
        americasSource.setData(liveData);
        updateObservationCount(liveData);
        return;
      }
      const regionCodes = [REGION_CODE];
      setIsLoading(true);
      try {
        const cached = await readCountriesGeoJson(regionCodes);
        const cachedAmericas = cached[REGION_CODE];

        if (cachedAmericas && cachedAmericas.type === 'FeatureCollection') {
          americasSource.setData(cachedAmericas);
          updateObservationCount(cachedAmericas);
        } else {
          updateObservationCount(null);
        }
        await apiWildfires({
          numberOfDays,
          startDate,
        });
        const refreshed = await readCountriesGeoJson(regionCodes);
        const refreshedAmericas = refreshed[REGION_CODE];
        if (
          refreshedAmericas &&
          refreshedAmericas.type === 'FeatureCollection'
        ) {
          americasSource.setData(refreshedAmericas);
          setLiveData(refreshedAmericas);
          updateObservationCount(refreshedAmericas);
        } else {
          setLiveData(null);
          updateObservationCount(null);
        }
        lastFetchKeyRef.current = fetchKey;
      } finally {
        setIsLoading(false);
      }
    },
    [liveData, numberOfDays, setIsLoading, startDate, updateObservationCount]
  );

  const addWildfireLayers = useCallback(
    (map: mapboxgl.Map, sourceId: string) => {
      const symbolLayerId = (() => {
        const layers = map.getStyle()?.layers ?? [];
        for (const layer of layers) {
          if (layer.type !== 'symbol') continue;
          const layout = (
            layer as mapboxgl.AnyLayer & {
              layout?: Record<string, unknown>;
            }
          ).layout;
          const textField = layout?.['text-field'];
          if (typeof textField === 'string' && textField.trim().length > 0) {
            return layer.id;
          }
        }
        return undefined;
      })();

      map.addLayer(
        {
          id: `${sourceId}-heatmap`,
          type: 'heatmap',
          source: sourceId,
          maxzoom: 9,
          paint: {
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              [
                'coalesce',
                ['to-number', ['get', 'frp']],
                ['to-number', ['get', 'brightness']],
                0,
              ],
              0,
              0,
              250,
              1,
            ],
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.8,
              6,
              1.6,
              9,
              3.2,
            ],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(16, 16, 32, 0)',
              0.15,
              '#ff4500', // OrangeRed
              0.35,
              '#ff6347', // Tomato
              0.6,
              '#ff8c00', // DarkOrange
              0.85,
              '#ffa500', // Orange
              1,
              '#ff0000', // Red
            ],
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              6,
              6,
              16,
              9,
              32,
            ],
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7,
              0.9,
              9,
              0.1,
            ],
          },
        },
        symbolLayerId
      );

      map.addLayer(
        {
          id: `${sourceId}-halo`,
          type: 'circle',
          source: sourceId,
          minzoom: 5,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              4,
              8,
              14,
              12,
              36,
            ],
            'circle-color': 'rgba(255, 56, 152, 0.45)',
            'circle-blur': 0.85,
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              0.2,
              8,
              0.55,
              12,
              0.1,
            ],
          },
        },
        symbolLayerId
      );

      map.addLayer(
        {
          id: `${sourceId}-points`,
          type: 'circle',
          source: sourceId,
          minzoom: 4,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              2.4,
              8,
              5.2,
              12,
              9,
              15,
              14,
            ],
            'circle-color': COLORS.white,
            'circle-stroke-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              1,
              12,
              2.4,
              15,
              4,
            ],
            'circle-stroke-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'confidence']], 0],
              0,
              COLORS.skyBlue,
              50,
              COLORS.electricBlue,
              100,
              COLORS.orangeBright,
            ],
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              0.4,
              8,
              0.85,
              15,
              1,
            ],
          },
        },
        symbolLayerId
      );
    },
    []
  );

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_KEY;
    if (mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v10',
        attributionControl: false,
        center: [P2COORDS.lng, P2COORDS.lat],
        zoom: DEFAULT_GLOBAL_ZOOM,
        pitch: 0,
        bearing: 0,
        projection: { name: 'globe' },
      });
      mapRef.current.addControl(
        new mapboxgl.NavigationControl({ visualizePitch: true }),
        'top-right'
      );
      mapRef.current.on('load', () => {
        mapRef.current?.setFog({
          range: [0.65, 8],
          color: 'rgba(7, 11, 25, 0.8)',
          'high-color': 'rgba(86, 206, 255, 0.25)',
          'space-color': '#020817',
          'star-intensity': 0.5,
        });

        mapRef.current?.addSource('wildfires-americas', {
          type: 'geojson',
          data: 'americas.geojson',
        });
        mapRef.current &&
          addWildfireLayers(mapRef.current, 'wildfires-americas');
        setIsMapReady(true);
      });
    }
    return () => {
      markerRef.current?.remove();
      popupRef.current?.remove();
      mapRef.current && mapRef.current.remove();
      markerRef.current = null;
      popupRef.current = null;
      if (rotationFrameRef.current !== null) {
        window.cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    setMapData(mapRef.current);
  }, [isMapReady, setMapData]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const map = mapRef.current;
    const cancelRotation = () => {
      if (rotationFrameRef.current !== null) {
        window.cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      rotationLastTimestampRef.current = null;
    };

    map.jumpTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      bearing: 0,
      pitch: 0,
      zoom: DEFAULT_GLOBAL_ZOOM,
    });

    const rotateStep = (timestamp: number) => {
      if (!mapRef.current) {
        return;
      }

      if (rotationLastTimestampRef.current === null) {
        rotationLastTimestampRef.current = timestamp;
      }

      const deltaMs = timestamp - rotationLastTimestampRef.current;
      rotationLastTimestampRef.current = timestamp;

      const deltaDegrees = (deltaMs / 1000) * AUTO_ROTATION_DEG_PER_SEC;
      const currentCenter = mapRef.current.getCenter();
      const nextLng = normalizeLongitude(currentCenter.lng + deltaDegrees);

      mapRef.current.setCenter([nextLng, currentCenter.lat]);

      const currentBearing = mapRef.current.getBearing();
      if (Math.abs(currentBearing) > 0.0001) {
        mapRef.current.setBearing(0);
      }

      const currentPitch = mapRef.current.getPitch();
      if (Math.abs(currentPitch) > 0.0001) {
        mapRef.current.setPitch(0);
      }

      rotationFrameRef.current = window.requestAnimationFrame(rotateStep);
    };

    const startRotation = () => {
      cancelRotation();
      rotationLastTimestampRef.current = null;
      rotationFrameRef.current = window.requestAnimationFrame(rotateStep);
    };

    const interactionEvents: Array<
      | 'mousedown'
      | 'touchstart'
      | 'wheel'
      | 'dragstart'
      | 'rotatestart'
      | 'pitchstart'
    > = [
      'mousedown',
      'touchstart',
      'wheel',
      'dragstart',
      'rotatestart',
      'pitchstart',
    ];

    const stopRotation = () => {
      cancelRotation();
      interactionEvents.forEach((event) => map.off(event, stopRotation));
    };

    // Allow the user to take over rotation on any interaction.
    interactionEvents.forEach((event) => map.on(event, stopRotation));

    startRotation();

    return () => {
      cancelRotation();
      interactionEvents.forEach((event) => map.off(event, stopRotation));
    };
  }, [isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    if (!marker) {
      markerRef.current?.remove();
      popupRef.current?.remove();
      markerRef.current = null;
      popupRef.current = null;
      return;
    }
    const { lat, lng } = marker;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const map = mapRef.current;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: COLORS.crimson });
    }
    markerRef.current.setLngLat([lng, lat]).addTo(map);
    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        offset: 18,
        maxWidth: '260px',
      });
    }
    const popupEl = document.createElement('div');
    popupEl.className = 'map-marker-popup';
    popupEl.style.backgroundColor = COLORS.slate900;
    popupEl.style.border = `1px solid ${COLORS.skyBlue}`;
    popupEl.style.borderRadius = '6px';
    popupEl.style.padding = '8px 12px';
    popupEl.style.color = COLORS.white;
    popupEl.style.fontSize = '13px';
    popupEl.style.fontFamily = 'Assistant, sans-serif';
    popupEl.style.boxShadow = `0 4px 12px rgba(0, 0, 0, 0.3)`;

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.style.color = COLORS.white;
    titleEl.style.marginBottom = '4px';
    titleEl.textContent =
      marker.location && marker.location.trim().length
        ? marker.location
        : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    popupEl.appendChild(titleEl);

    const coordEl = document.createElement('div');
    coordEl.style.fontSize = '11px';
    coordEl.style.color = COLORS.skyBlue;
    coordEl.style.opacity = '0.8';
    coordEl.textContent = `Lat ${lat.toFixed(2)} · Lng ${lng.toFixed(2)}`;
    popupEl.appendChild(coordEl);
    if (marker.temperature) {
      const tempEl = document.createElement('div');
      tempEl.style.fontSize = '12px';
      tempEl.style.color = COLORS.white;
      tempEl.style.marginTop = '3px';
      tempEl.textContent = `Temp: ${marker.temperature.value.toFixed(1)} ${
        marker.temperature.units
      }`;
      popupEl.appendChild(tempEl);
    }
    if (marker.wind_speed) {
      const windEl = document.createElement('div');
      windEl.style.fontSize = '12px';
      windEl.style.color = COLORS.white;
      windEl.style.marginTop = '3px';
      windEl.textContent = `Wind: ${marker.wind_speed.value.toFixed(1)} ${
        marker.wind_speed.units
      }`;
      popupEl.appendChild(windEl);
    }
    if (marker.daysSinceRain !== undefined && marker.daysSinceRain !== null) {
      const rainEl = document.createElement('div');
      rainEl.style.fontSize = '12px';
      rainEl.style.color = COLORS.white;
      rainEl.style.marginTop = '3px';
      rainEl.textContent =
        marker.daysSinceRain === -1
          ? 'No rain in the past 10+ days'
          : `Days since rain: ${marker.daysSinceRain}`;
      popupEl.appendChild(rainEl);
    }
    popupRef.current.setDOMContent(popupEl);
    markerRef.current.setPopup(popupRef.current);
    popupRef.current.addTo(map);
  }, [marker, isMapReady]);

  // Keep updating the map view based on coords
  useEffect(() => {
    if (!mapRef.current || !isMapReady || !focusCoords) return;
    mapRef.current.flyTo({
      center: [focusCoords.lng, focusCoords.lat],
      zoom: isLargeScreen ? 6 : 5,
      essential: true,
    });
  }, [focusCoords, isLargeScreen, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady || focusCoords) return;
    mapRef.current.flyTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      zoom: DEFAULT_GLOBAL_ZOOM,
      pitch: 0,
      essential: false,
    });
  }, [isMapReady, focusCoords]);

  return (
    <div
      className="h-full"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.12), rgba(15, 23, 42, 0.06) 48%, rgba(15, 23, 42, 0) 80%)',
      }}
    >
      <div
        id="map-container"
        ref={mapContainerRef}
        className="h-full w-full"
        style={{ backgroundColor: COLORS.slate900 }}
      />
    </div>
  );
};
