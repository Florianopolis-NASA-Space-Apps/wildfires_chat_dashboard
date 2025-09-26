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
  lat: 14,
  lng: -30,
};
const REGION_CODE = 'AMERICAS' as const;

export const MBox = ({
  isLargeScreen,
  isExtraLargeScreen,
  setIsLoading,
  focusCoords,
  marker,
  numberOfDays,
  startDate,
}: {
  isLargeScreen: boolean;
  isExtraLargeScreen: boolean;
  setIsLoading: (loading: boolean) => void;
  focusCoords: IMapCoords | null;
  marker: MapMarkerDetails | null;
  numberOfDays: string;
  startDate: string;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveData, setLiveData] = useState<FeatureCollection | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

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
        return;
      }
      const regionCodes = [REGION_CODE];
      setIsLoading(true);
      try {
        const cached = await readCountriesGeoJson(regionCodes);
        const cachedAmericas = cached[REGION_CODE];

        if (cachedAmericas && cachedAmericas.type === 'FeatureCollection') {
          americasSource.setData(cachedAmericas);
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
        } else {
          setLiveData(null);
        }
        lastFetchKeyRef.current = fetchKey;
      } finally {
        setIsLoading(false);
      }
    },
    [liveData, numberOfDays, setIsLoading, startDate]
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
            COLORS.orange,
            100,
            COLORS.crimson,
            750,
            COLORS.amber,
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
          'circle-color': COLORS.orange,
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
        attributionControl: false,
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
    setMapData(mapRef.current);
  }, [isMapReady, setMapData]);

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
      tempEl.textContent = `Temp: ${marker.temperature.value.toFixed(1)} ${
        marker.temperature.units
      }`;
      popupEl.appendChild(tempEl);
    }
    if (marker.wind_speed) {
      const windEl = document.createElement('div');
      windEl.textContent = `Wind: ${marker.wind_speed.value.toFixed(1)} ${
        marker.wind_speed.units
      }`;
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
      zoom: isLargeScreen ? 6 : 5,
      essential: true,
    });
  }, [focusCoords, isLargeScreen, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady || focusCoords) return;
    mapRef.current.flyTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      zoom: isExtraLargeScreen ? 1.6 : 1.2,
      essential: false,
    });
  }, [isMapReady, focusCoords, isExtraLargeScreen]);

  return (
    <div className="h-full" style={{ backgroundColor: COLORS.sand }}>
      <div
        id="map-container"
        ref={mapContainerRef}
        className="h-full w-full"
        style={{ backgroundColor: COLORS.sand }}
      />
    </div>
  );
};
