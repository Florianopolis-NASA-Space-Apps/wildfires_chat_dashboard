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

const P2COORDS: IMapCoords = { lat: -10, lng: -78.3355236 };
const REGION_CODE = 'AMERICAS' as const;

export const MBox = ({
  dataMode,
  setIsLoading,
  isLargeScreen,
}: {
  isLargeScreen: boolean;
  dataMode: 'live' | 'historical';
  setIsLoading: (loading: boolean) => void;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveData, setLiveData] = useState<FeatureCollection | null>(null);

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
        center: [P2COORDS.lat, P2COORDS.lng],
        zoom: 10.12,
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
      });
    }

    return () => {
      mapRef.current && mapRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    setMapData(mapRef.current, dataMode);
  }, [dataMode]);

  // Keep updating the map view based on coords
  useEffect(() => {
    mapRef.current &&
      mapRef.current.flyTo({
        center: [P2COORDS.lng, P2COORDS.lat],
        zoom: isLargeScreen ? 2 : 1,
      });
  }, []);

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
