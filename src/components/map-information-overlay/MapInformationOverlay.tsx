import type { MapMarkerDetails } from '../mbox/MBox';
import type { BoundingBoxObservationStats } from '../../utils/wildfireDb';

interface MapInformationOverlayProps {
  markerInfo: MapMarkerDetails | null;
  observationValue: BoundingBoxObservationStats | null;
  lastObservationQuery: string | null;
}

function formatStatValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function MapInformationOverlay({
  markerInfo,
  observationValue,
  lastObservationQuery,
}: MapInformationOverlayProps) {
  if (!markerInfo && observationValue === null) {
    return null;
  }

  return (
    <div className="map-information-overlay">
      <div className="map-overlay-panel">
        {markerInfo && (
          <div className="map-overlay-section">
            <div className="map-overlay-heading">Selected Location</div>
            <div>
              {markerInfo.location && markerInfo.location.trim().length
                ? markerInfo.location
                : `${markerInfo.lat.toFixed(2)}, ${markerInfo.lng.toFixed(2)}`}
            </div>
            <div className="map-overlay-coords">
              Lat: {markerInfo.lat.toFixed(2)} · Lng:{' '}
              {markerInfo.lng.toFixed(2)}
            </div>
            {markerInfo.temperature && (
              <div>
                Temperature: {markerInfo.temperature.value.toFixed(1)}{' '}
                {markerInfo.temperature.units}
              </div>
            )}
            {markerInfo.wind_speed && (
              <div>
                Wind: {markerInfo.wind_speed.value.toFixed(1)}{' '}
                {markerInfo.wind_speed.units}
              </div>
            )}
            {markerInfo.daysSinceRain !== undefined &&
              markerInfo.daysSinceRain !== null && (
                <div>
                  {markerInfo.daysSinceRain === -1
                    ? 'Last rain more than 10 days ago'
                    : `Days since rain: ${markerInfo.daysSinceRain}`}
                </div>
              )}
          </div>
        )}
        {observationValue !== null && (
          <div className="map-overlay-section">
            <div className="map-overlay-heading">Observation Query</div>
            <div>Wildfire Count: {observationValue.count.toLocaleString()}</div>
            <div>
              Brightness (avg/min/max):{' '}
              {formatStatValue(observationValue.brightness.average)} /
              {formatStatValue(observationValue.brightness.minimum)} /
              {formatStatValue(observationValue.brightness.maximum)}
            </div>
            <div>
              Fire Radiative Power (avg/min/max):{' '}
              {formatStatValue(observationValue.frp.average)} /
              {formatStatValue(observationValue.frp.minimum)} /
              {formatStatValue(observationValue.frp.maximum)}
            </div>
            <div>
              Pixel Width (scan) avg/min/max:{' '}
              {formatStatValue(observationValue.scan.average)} /
              {formatStatValue(observationValue.scan.minimum)} /
              {formatStatValue(observationValue.scan.maximum)}
            </div>
            <div>
              Pixel Height (track) avg/min/max:{' '}
              {formatStatValue(observationValue.track.average)} /
              {formatStatValue(observationValue.track.minimum)} /
              {formatStatValue(observationValue.track.maximum)}
            </div>
            {lastObservationQuery && (
              <pre className="map-overlay-query">{lastObservationQuery}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
