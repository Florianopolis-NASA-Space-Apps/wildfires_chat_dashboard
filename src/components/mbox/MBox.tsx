import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection } from 'geojson';
import { apiWildfires } from '../../utils/apiWildfires';
import { readCountriesGeoJson } from '../../utils/wildfireDb';

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

const P2COORDS: IMapCoords = { lat: -10, lng: -78.3355236 };
const REGION_CODE = 'AMERICAS' as const;

export const MBox = ({
  dataMode,
  setIsLoading,
  isLargeScreen,
  focusCoords,
  marker,
}: {
  isLargeScreen: boolean;
  dataMode: 'live' | 'historical';
  setIsLoading: (loading: boolean) => void;
  focusCoords: IMapCoords | null;
  marker: MapMarkerDetails | null;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveData, setLiveData] = useState<FeatureCollection | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const setMapData = useCallback(
    async (map: mapboxgl.Map, mode: 'live' | 'historical') => {
      const americasSource = map.getSource(
        'wildfires-americas'
      ) as mapboxgl.GeoJSONSource;
      if (!americasSource) return;

      if (mode === 'live') {
        if (liveData && liveData.type === 'FeatureCollection') {
          americasSource.setData(liveData);
        } else {
          const regionCodes = [REGION_CODE];
          setIsLoading(true);
          try {
            const cached = await readCountriesGeoJson(regionCodes);
            const cachedAmericas = cached[REGION_CODE];

            if (
              cachedAmericas &&
              cachedAmericas.type === 'FeatureCollection'
            ) {
              americasSource.setData(cachedAmericas);
            }

            await apiWildfires({
              numberOfDays: '4',
            });

            const refreshed = await readCountriesGeoJson(regionCodes);
            const refreshedAmericas = refreshed[REGION_CODE];
            if (
              refreshedAmericas &&
              refreshedAmericas.type === 'FeatureCollection'
            ) {
              americasSource.setData(refreshedAmericas);
              setLiveData(refreshedAmericas);
            } else {
              setLiveData(null);
            }
          } finally {
            setIsLoading(false);
          }
        }
      } else {
        americasSource.setData('/americas.geojson');
      }
    },
    [liveData, setIsLoading]
  );

  const addClusterLayers = useCallback(
    (map: mapboxgl.Map, sourceId: string, suffix: string) => {
      map.addLayer({
        id: `clusters-${suffix}`,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#e85607',
            100,
            '#e22822',
            750,
            '#fede17',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            100,
            30,
            750,
            40,
          ],
        },
      });
      map.addLayer({
        id: `cluster-count-${suffix}`,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
      });
      map.addLayer({
        id: `unclustered-point-${suffix}`,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#e85607',
          'circle-radius': 12,
        },
      });
    },
    []
  );

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_KEY;
    if (mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: [P2COORDS.lng, P2COORDS.lat],
        zoom: 2.5,
      });

      mapRef.current.on('load', () => {
        // Add Americas wildfires source
        mapRef.current?.addSource('wildfires-americas', {
          type: 'geojson',
          data: 'americas.geojson',
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        mapRef.current &&
          addClusterLayers(mapRef.current, 'wildfires-americas', 'americas');
        setIsMapReady(true);
      });
    }

    return () => {
      markerRef.current?.remove();
      popupRef.current?.remove();
      mapRef.current && mapRef.current.remove();
      markerRef.current = null;
      popupRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    setMapData(mapRef.current, dataMode);
  }, [dataMode, isMapReady, setMapData]);

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
      markerRef.current = new mapboxgl.Marker({ color: '#e22822' });
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

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.textContent =
      marker.location && marker.location.trim().length
        ? marker.location
        : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    popupEl.appendChild(titleEl);

    const coordEl = document.createElement('div');
    coordEl.style.fontSize = '11px';
    coordEl.style.opacity = '0.7';
    coordEl.textContent = `Lat ${lat.toFixed(2)} · Lng ${lng.toFixed(2)}`;
    popupEl.appendChild(coordEl);

    if (marker.temperature) {
      const tempEl = document.createElement('div');
      tempEl.textContent = `Temp: ${marker.temperature.value.toFixed(1)} ${marker.temperature.units}`;
      popupEl.appendChild(tempEl);
    }

    if (marker.wind_speed) {
      const windEl = document.createElement('div');
      windEl.textContent = `Wind: ${marker.wind_speed.value.toFixed(1)} ${marker.wind_speed.units}`;
      popupEl.appendChild(windEl);
    }

    if (marker.daysSinceRain !== undefined && marker.daysSinceRain !== null) {
      const rainEl = document.createElement('div');
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
      zoom: isLargeScreen ? 4 : 3,
      essential: true,
    });
  }, [focusCoords, isLargeScreen, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady || focusCoords) return;
    mapRef.current.flyTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      zoom: isLargeScreen ? 2.5 : 1.5,
      essential: false,
    });
  }, [isLargeScreen, isMapReady, focusCoords]);

  return (
    <div className="bg-red-400 h-full">
      <div
        id="map-container"
        ref={mapContainerRef}
        className="h-full w-full bg-gray-300"
      />
    </div>
  );
};
