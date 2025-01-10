import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';

export interface IMapCoords {
  lat: number;
  lng: number;
}

export const MBox = ({ coords }: { coords: IMapCoords }) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

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
          data: '/brazil.geojson',
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Add USA wildfires source
        mapRef.current?.addSource('wildfires-usa', {
          type: 'geojson',
          data: '/USA.geojson',
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Add layers for Brazil wildfires
        mapRef.current?.addLayer({
          id: 'clusters-brazil',
          type: 'circle',
          source: 'wildfires-brazil',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#e22822',
              100,
              '#e85607',
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

        mapRef.current?.addLayer({
          id: 'cluster-count-brazil',
          type: 'symbol',
          source: 'wildfires-brazil',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
        });

        mapRef.current?.addLayer({
          id: 'unclustered-point-brazil',
          type: 'circle',
          source: 'wildfires-brazil',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#e85607',
            'circle-radius': 20,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          },
        });

        // Add layers for USA wildfires
        mapRef.current?.addLayer({
          id: 'clusters-usa',
          type: 'circle',
          source: 'wildfires-usa',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#e22822',
              100,
              '#e85607',
              750,
              '#fede17',
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              20, // Radius for small clusters
              100, // Change radius for larger clusters
              30,
              750,
              40,
            ],
          },
        });

        mapRef.current?.addLayer({
          id: 'cluster-count-usa',
          type: 'symbol',
          source: 'wildfires-usa',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
        });

        mapRef.current?.addLayer({
          id: 'unclustered-point-usa',
          type: 'circle',
          source: 'wildfires-usa',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#e85607',
            'circle-radius': 20,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          },
        });
      });
    }

    return () => {
      mapRef.current && mapRef.current.remove();
    };
  }, []);

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
