import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';
import { Spinner } from '../spinner/Spinner';

const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';

export interface IMapCoords {
  lat: number;
  lng: number;
}

export const MBox = ({
  coords,
  dataMode,
  setIsLoading,
}: {
  coords: IMapCoords;
  dataMode: 'live' | 'historical';
  setIsLoading: (loading: boolean) => void;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [brazilLiveData, setBrazilLiveData] = useState<any>(null);
  const [usaLiveData, setUsaLiveData] = useState<any>(null);
  const [argentinaLiveData, setArgentinaLiveData] = useState<any>(null);

  const setMapData = useCallback(
    (map: mapboxgl.Map, mode: 'live' | 'historical') => {
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
        if (brazilLiveData && usaLiveData && argentinaLiveData) {
          brazilSource.setData(brazilLiveData);
          usaSource.setData(usaLiveData);
          argentinaSource.setData(argentinaLiveData);
        } else {
          setIsLoading(true);
          fetch('https://zernach.uc.r.appspot.com/api/wildfires?country=BRA')
            .then((res) => res.json())
            .then((data) => {
              setBrazilLiveData(data);
              brazilSource.setData(data);
              setIsLoading(false);
            });
          fetch('https://zernach.uc.r.appspot.com/api/wildfires?country=USA')
            .then((res) => res.json())
            .then((data) => {
              setUsaLiveData(data);
              usaSource.setData(data);
              setIsLoading(false);
            });
          fetch('https://zernach.uc.r.appspot.com/api/wildfires?country=ARG')
            .then((res) => res.json())
            .then((data) => {
              setArgentinaLiveData(data);
              argentinaSource.setData(data);
              setIsLoading(false);
            });
        }
      } else {
        brazilSource.setData('/brazil.geojson');
        usaSource.setData('/USA.geojson');
        argentinaSource.setData('/argentina.geojson');
      }
    },
    [brazilLiveData, usaLiveData, argentinaLiveData]
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
        center: [coords.lat, coords.lng],
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
  }, [dataMode, setMapData]);

  // Keep updating the map view based on coords
  useEffect(() => {
    mapRef.current &&
      mapRef.current.flyTo({
        center: coords,
        zoom: 2,
      });
  }, [coords]);

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
