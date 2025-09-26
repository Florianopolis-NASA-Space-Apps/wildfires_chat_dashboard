/**
 * You can connect directly to OpenAI by setting the following environment variables:
 * Optionally override the websocket endpoint with REACT_APP_OPENAI_REALTIME_URL=
 */

import { useEffect, useCallback, useState } from 'react';
import { X, ExternalLink } from 'react-feather';
import { Button } from '../components/button/Button';
import './ConsolePage.scss';
import { MBox, IMapCoords, MapMarkerDetails } from '../components/mbox/MBox';
import { Spinner } from '../components/spinner/Spinner';
import { RealtimeVoiceModal } from '../components/realtime-voice/RealtimeVoiceModal';

const SLIDE_DECK_LINK =
  'https://docs.google.com/presentation/d/e/2PACX-1vTezgMfwMSMOTV1xAERxRqVY9TMX-bF-45w2v5gP4jbs8Wy1t_H3u5kTwkxNfQFcA/embed?start=false&loop=false&delayms=60000';

export function ConsolePage() {
  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'live' | 'historical'>('historical');
  const [isLoading, setIsLoading] = useState(false);
  const [markerInfo, setMarkerInfo] = useState<MapMarkerDetails | null>(null);
  const [mapPosition, setMapPosition] = useState<IMapCoords | null>(null);
  const [lastObservationQuery, setLastObservationQuery] = useState<string | null>(
    null
  );
  const [observationValue, setObservationValue] = useState<number | null>(null);

  const resetRealtimeContext = useCallback(() => {
    setMarkerInfo(null);
    setMapPosition(null);
    setObservationValue(null);
    setLastObservationQuery(null);
  }, [
    setMarkerInfo,
    setMapPosition,
    setObservationValue,
    setLastObservationQuery,
  ]);

  const updateMarkerInfo = useCallback((update: Partial<MapMarkerDetails>) => {
    setMarkerInfo((previous) => {
      if (!previous) {
        if (update.lat === undefined || update.lng === undefined) {
          return previous;
        }
        return {
          lat: update.lat,
          lng: update.lng,
          ...update,
        } as MapMarkerDetails;
      }
      return { ...previous, ...update };
    });
  }, []);

  // Add this function to close the lightbox
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  /**
   * State to track window width
   */
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isLargeScreen = windowWidth >= 654;
  /**
   * Update window width on resize
   */
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openSlideDeck = useCallback(() => {
    if (isLargeScreen) {
      setIsLightboxOpen(true);
    } else {
      // open SLIDE_DECK_LINK in new tab
      window.open(SLIDE_DECK_LINK, '_blank');
    }
  }, [isLargeScreen]);

  const DatasetControlsSmall = (
    <div
      className={`content-actions`}
      style={{ alignItems: 'center', alignSelf: 'center' }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
      >
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'historical'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'historical' ? 1 : 0.6 }}
          onClick={() => setDataMode('historical')}
        >
          {`HISTORICAL`}
        </button>
        <p
          style={{ fontWeight: dataMode === 'historical' ? 'bold' : 'normal' }}
        >
          January 6th - 10th 2025
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'live'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'live' ? 1 : 0.6 }}
          onClick={() => setDataMode('live')}
        >
          {`LIVE`}
        </button>
        <div
          style={{
            minWidth: 180,
            fontWeight: dataMode === 'live' ? 'bold' : 'normal',
          }}
        >
          {isLoading ? <Spinner size={30} /> : `${getDateRangeString()}`}
        </div>
      </div>
    </div>
  );

  const DatasetControlsLarge = (
    <div className="dataset-controls">
      <div className="content-actions">
        <p
          style={{ fontWeight: dataMode === 'historical' ? 'bold' : 'normal' }}
        >
          January 6th - 10th 2025
        </p>
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'historical'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'historical' ? 1 : 0.6 }}
          onClick={() => setDataMode('historical')}
        >
          {`HISTORICAL`}
        </button>
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'live'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'live' ? 1 : 0.6 }}
          onClick={() => setDataMode('live')}
        >
          {`LIVE`}
        </button>
        <div
          style={{
            minWidth: 180,
            fontWeight: dataMode === 'live' ? 'bold' : 'normal',
          }}
        >
          {isLoading ? <Spinner /> : `${getDateRangeString()}`}
        </div>
      </div>
    </div>
  );

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img
            src="/logo_fires_satellites.png"
            style={{
              width: imageSize,
              height: imageSize,
              marginLeft: -30,
              marginRight: -10,
            }}
          />
          <div>
            <div>
              <span style={{ fontSize: 50 }}>{'GROW'}</span>
            </div>
            <span style={{ fontSize: isLargeScreen ? 20 : 14 }}>
              {'Global Recovery and Observation of Wildfires'}
            </span>
          </div>
        </div>
        {isLargeScreen && (
          <div style={{ flexDirection: 'row' }}>
            <Button
              icon={ExternalLink}
              iconPosition="end"
              buttonStyle="flush"
              style={{ fontSize: 18, textAlign: 'right' }}
              label={`Presentation Slide Deck`}
              onClick={openSlideDeck}
            />
          </div>
        )}
        <img
          src="/nasa-logo.png"
          style={{ width: imageSize, height: imageSize }}
        />
      </div>
      <div className="content-main">
        <div className="content-right">
          <div className="content-block map" style={{ height: '100%' }}>
            <MBox
              isLargeScreen={isLargeScreen}
              dataMode={dataMode}
              setIsLoading={setIsLoading}
              focusCoords={mapPosition}
              marker={markerInfo}
            />
            {(markerInfo || observationValue !== null) && (
              <div className="map-overlay-panel">
                {markerInfo && (
                  <div className="map-overlay-section">
                    <div className="map-overlay-heading">Selected Location</div>
                    <div>
                      {markerInfo.location && markerInfo.location.trim().length
                        ? markerInfo.location
                        : `${markerInfo.lat.toFixed(2)}, ${markerInfo.lng.toFixed(
                            2
                          )}`}
                    </div>
                    <div className="map-overlay-coords">
                      Lat: {markerInfo.lat.toFixed(2)} · Lng:{' '}
                      {markerInfo.lng.toFixed(2)}
                    </div>
                    {markerInfo.temperature && (
                      <div>
                        Temperature:{' '}
                        {markerInfo.temperature.value.toFixed(1)}{' '}
                        {markerInfo.temperature.units}
                      </div>
                    )}
                    {markerInfo.wind_speed && (
                      <div>
                        Wind:{' '}
                        {markerInfo.wind_speed.value.toFixed(1)}{' '}
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
                    <div>Value: {observationValue}</div>
                    {lastObservationQuery && (
                      <pre className="map-overlay-query">
                        {lastObservationQuery}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {isLargeScreen ? DatasetControlsLarge : DatasetControlsSmall}
        {!isLargeScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            style={{ fontSize: 18, textAlign: 'center' }}
            label={`Presentation Slide Deck`}
            onClick={openSlideDeck}
          />
        )}
      </div>
      {isLightboxOpen && (
        <div className="lightbox">
          <div className="lightbox-content">
            <button className="close-button" onClick={closeLightbox}>
              <X />
            </button>
            {/* <iframe
              src="https://docs.google.com/presentation/d/e/2PACX-1vTAt9Nm2nNJb10eOdq_wcpM7IvLHe4azYY5qqazgSbwziSoeB52P6A8aJQEKSuRDy5tEhBbGbrzH84w/embed?start=false&loop=false&delayms=3000"
              frameBorder="0"
              width="960"
              height="569"
              allowFullScreen={true}
            ></iframe> */}
            <iframe
              src={SLIDE_DECK_LINK}
              frameBorder="0"
              width="960"
              height="569"
              allowFullScreen={true}
            ></iframe>
          </div>
        </div>
      )}
      <RealtimeVoiceModal
        onMarkerUpdate={updateMarkerInfo}
        onMapPositionChange={setMapPosition}
        onObservationQueryChange={setLastObservationQuery}
        onObservationValueChange={setObservationValue}
        onResetContext={resetRealtimeContext}
      />
    </div>
  );
}

const imageSize = 130;

/**
 * Returns a string with the correct ordinal suffix.
 * e.g., 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", ...
 */
function addOrdinalSuffix(day: any) {
  const remainder10 = day % 10;
  const remainder100 = day % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return day + 'th';
  }

  switch (remainder10) {
    case 1:
      return day + 'st';
    case 2:
      return day + 'nd';
    case 3:
      return day + 'rd';
    default:
      return day + 'th';
  }
}

export function getDateRangeString() {
  // Today’s date
  const today = new Date();

  // Clone the date, then subtract 4 days
  const fourDaysAgo = new Date(today);
  fourDaysAgo.setDate(today.getDate() - 4);

  // Create options for month name
  const monthOptions: Intl.DateTimeFormatOptions = {
    month: 'long', // or 'short' | 'narrow' | 'numeric' | '2-digit'
  };

  // Get individual pieces: day, month, year
  const startDay = fourDaysAgo.getDate();
  const startMonth = fourDaysAgo.toLocaleString('en-US', monthOptions);
  const startYear = fourDaysAgo.getFullYear();

  const endDay = today.getDate();
  const endMonth = today.toLocaleString('en-US', monthOptions);
  const endYear = today.getFullYear();

  // Build ordinal dates
  const startDayOrdinal = addOrdinalSuffix(startDay);
  const endDayOrdinal = addOrdinalSuffix(endDay);

  // If the month and year are the same, simplify the display
  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDayOrdinal} - ${endDayOrdinal} ${startYear}`;
  }

  // Otherwise, show full ranges
  return (
    `${startMonth} ${startDayOrdinal} ${startYear} - ` +
    `${endMonth} ${endDayOrdinal} ${endYear}`
  );
}
