import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';
import { Spinner } from '../spinner/Spinner';
import { apiWildfires } from '../../utils/apiWildfires';

const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';

export interface IMapCoords {
  lat: number;
  lng: number;
}

const P2COORDS = { lat: -0.363987, lng: -60.3355236 };

export const MBox = ({
  dataMode,
  setIsLoading,
}: {
  dataMode: 'live' | 'historical';
  setIsLoading: (loading: boolean) => void;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [liveData, setLiveData] = useState<{
    BRA: any;
    USA: any;
    ARG: any;
  } | null>(null);

  const setMapData = useCallback(
    async (map: mapboxgl.Map, mode: 'live' | 'historical') => {
      const brazilSource = map.getSource(
        'wildfires-brazil'
      ) as mapboxgl.GeoJSONSource;
      const usaSource = map.getSource(
        'wildfires-usa'
      ) as mapboxgl.GeoJSONSource;
      const argentinaSource = map.getSource(
        'wildfires-argentina'
      ) as mapboxgl.GeoJSONSource;
      if (!brazilSource || !usaSource || !argentinaSource) return;

      if (mode === 'live') {
        if (liveData) {
          brazilSource.setData(liveData.BRA);
          usaSource.setData(liveData.USA);
          argentinaSource.setData(liveData.ARG);
        } else {
          setIsLoading(true);
          const countries = 'BRA,USA,ARG';
          const localFetch = await apiWildfires({
            countries,
            numberOfDays: '4',
          });
          if (!localFetch) {
            return;
          }
          brazilSource.setData(localFetch.BRA);
          usaSource.setData(localFetch.USA);
          argentinaSource.setData(localFetch.ARG);
          setLiveData(localFetch);
          setIsLoading(false);
        }
      } else {
        brazilSource.setData('/brazil.geojson');
        usaSource.setData('/USA.geojson');
        argentinaSource.setData('/argentina.geojson');
      }
    },
    [liveData]
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
        // Add Brazil wildfires source
        mapRef.current?.addSource('wildfires-brazil', {
          type: 'geojson',
          data: 'brazil.geojson', // default to historical
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Add USA wildfires source
        mapRef.current?.addSource('wildfires-usa', {
          type: 'geojson',
          data: 'USA.geojson', // default to historical
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Add Argentina wildfires source
        mapRef.current?.addSource('wildfires-argentina', {
          type: 'geojson',
          data: 'argentina.geojson', // default to historical
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        mapRef.current &&
          addClusterLayers(mapRef.current, 'wildfires-brazil', 'brazil');
        mapRef.current &&
          addClusterLayers(mapRef.current, 'wildfires-usa', 'usa');
        mapRef.current &&
          addClusterLayers(mapRef.current, 'wildfires-argentina', 'argentina');
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
        zoom: 2,
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
