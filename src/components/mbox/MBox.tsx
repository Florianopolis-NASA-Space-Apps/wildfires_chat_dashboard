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
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [coords.lat, coords.lng],
        zoom: 10.12,
      });
      mapRef.current.on('load', () => {
        mapRef.current?.addSource('wildfires', {
          type: 'geojson',
          data: '/brazil.geojson', // Updated to use local file
          cluster: true, // Enable clustering
          clusterMaxZoom: 14, // Max zoom to cluster points
          clusterRadius: 50, // Radius of each cluster in pixels
        });

        mapRef.current?.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'wildfires',
          filter: ['has', 'point_count'], // Only display clusters
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#e22822', // Color for small clusters
              100, // Change color for larger clusters
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
          id: 'cluster-count',
          type: 'symbol',
          source: 'wildfires',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}', // Show the count
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
        });

        // Add unclustered points layer
        mapRef.current?.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'wildfires',
          filter: ['!', ['has', 'point_count']], // Only display individual points
          paint: {
            'circle-color': '#11b4da',
            'circle-radius': 4,
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
        zoom: 10,
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
