/**
 * You can connect directly to OpenAI by setting the following environment variables:
 * Optionally override the websocket endpoint with REACT_APP_OPENAI_REALTIME_URL=
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { X, ExternalLink, Calendar } from 'react-feather';
import { Button } from '../components/button/Button';
import './ConsolePage.scss';
import { MBox, IMapCoords, MapMarkerDetails } from '../components/mbox/MBox';
import { Spinner } from '../components/spinner/Spinner';
import { RealtimeVoiceModal } from '../components/realtime-voice/RealtimeVoiceModal';
import {
  DateRangeModal,
  type DateRange,
} from '../components/date-range/DateRangeModal';
import type { BoundingBoxObservationStats } from '../utils/wildfireDb';
import { COLORS } from '../constants/colors';

const SLIDE_DECK_LINK =
  'https://docs.google.com/presentation/d/e/2PACX-1vTezgMfwMSMOTV1xAERxRqVY9TMX-bF-45w2v5gP4jbs8Wy1t_H3u5kTwkxNfQFcA/embed?start=false&loop=false&delayms=60000';

function formatStatValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function ConsolePage() {
  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'live' | 'historical'>('live');
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialLoadStarted, setHasInitialLoadStarted] = useState(false);
  const [showInitialLoadingModal, setShowInitialLoadingModal] = useState(true);
  const [markerInfo, setMarkerInfo] = useState<MapMarkerDetails | null>(null);
  const [mapPosition, setMapPosition] = useState<IMapCoords | null>(null);
  const [lastObservationQuery, setLastObservationQuery] = useState<
    string | null
  >(null);
  const [observationValue, setObservationValue] =
    useState<BoundingBoxObservationStats | null>(null);
  const [isSpaceAppsModalVisible, setIsSpaceAppsModalVisible] = useState(true);
  const [isDatesMinimized, setIsDatesMinimized] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() =>
    getDefaultDateRange()
  );

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

  const dismissSpaceAppsModal = useCallback(() => {
    setIsSpaceAppsModalVisible(false);
  }, []);

  const openDateRangeModal = useCallback(() => {
    setIsDatesMinimized(false);
  }, []);

  const closeDateRangeModal = useCallback(() => {
    setIsDatesMinimized(true);
  }, []);

  const applyDateRange = useCallback((range: DateRange) => {
    const start = new Date(range.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(range.endDate);
    end.setHours(0, 0, 0, 0);
    setSelectedDateRange({ startDate: start, endDate: end });
  }, []);

  const selectedNumberOfDays = useMemo(
    () => String(getInclusiveDaySpan(selectedDateRange)),
    [selectedDateRange]
  );

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

  useEffect(() => {
    if (isLoading && !hasInitialLoadStarted) {
      setHasInitialLoadStarted(true);
      return;
    }

    if (!isLoading && hasInitialLoadStarted && showInitialLoadingModal) {
      setShowInitialLoadingModal(false);
    }
  }, [hasInitialLoadStarted, isLoading, showInitialLoadingModal]);

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
          {isLoading ? (
            <Spinner size={30} />
          ) : (
            `${formatDateRange(selectedDateRange)}`
          )}
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
          {isLoading ? <Spinner /> : `${formatDateRange(selectedDateRange)}`}
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
              numberOfDays={selectedNumberOfDays}
            />
            {showInitialLoadingModal && (
              <div
                className="map-loading-modal"
                role="status"
                aria-live="polite"
              >
                <Spinner size={36} color="#000080" />
                <div className="map-loading-text">
                  {'Retrieving wildfire observations...'}
                </div>
              </div>
            )}
            {isSpaceAppsModalVisible && (
              <div
                className="map-space-apps-modal"
                role="status"
                aria-live="polite"
                onClick={() =>
                  window.open(
                    'https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/',
                    '_blank'
                  )
                }
              >
                <button
                  type="button"
                  className="map-space-apps-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    dismissSpaceAppsModal();
                  }}
                  aria-label="Dismiss NASA Space Apps announcement"
                >
                  <X size={14} />
                </button>
                <div className="map-space-apps-heading">
                  {'2024 NASA Space Apps Challenge Winners'}
                </div>
                <div style={{ height: 10 }} />
                <div className="map-space-apps-subheading">
                  {'🏆 Top 10 out of 10,000 Worldwide Projects (Top 1%)'}
                </div>
              </div>
            )}
            {isLargeScreen && (
              <>
                {(markerInfo || observationValue !== null) && (
                  <div className="map-overlay-panel">
                    {markerInfo && (
                      <div className="map-overlay-section">
                        <div className="map-overlay-heading">
                          Selected Location
                        </div>
                        <div>
                          {markerInfo.location &&
                          markerInfo.location.trim().length
                            ? markerInfo.location
                            : `${markerInfo.lat.toFixed(
                                2
                              )}, ${markerInfo.lng.toFixed(2)}`}
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
                        <div className="map-overlay-heading">
                          Observation Query
                        </div>
                        <div>
                          Wildfire Count:{' '}
                          {observationValue.count.toLocaleString()}
                        </div>
                        <div>
                          Brightness (avg/min/max):{' '}
                          {formatStatValue(observationValue.brightness.average)}{' '}
                          /
                          {formatStatValue(observationValue.brightness.minimum)}{' '}
                          /
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
                          <pre className="map-overlay-query">
                            {lastObservationQuery}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <RealtimeVoiceModal
              onMarkerUpdate={updateMarkerInfo}
              onMapPositionChange={setMapPosition}
              onObservationQueryChange={setLastObservationQuery}
              onObservationValueChange={setObservationValue}
              onResetContext={resetRealtimeContext}
              isLargeScreen={isLargeScreen}
            />
            {isLargeScreen && (
              <DateRangeModal
                isMinimized={isDatesMinimized}
                onMinimize={closeDateRangeModal}
                onExpand={openDateRangeModal}
                onApply={applyDateRange}
                currentRange={selectedDateRange}
                maxDate={new Date()}
              />
            )}
          </div>
        </div>
        {/* {isLargeScreen ? DatasetControlsLarge : DatasetControlsSmall} */}
        {!isLargeScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            style={{
              fontSize: 18,
              textAlign: 'center',
              backgroundColor: COLORS.tan,
              alignSelf: 'flex-end',
              marginTop: -10,
              marginBottom: -10,
            }}
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
    </div>
  );
}

const imageSize = 130;

/**
 * Returns a string with the correct ordinal suffix.
 * e.g., 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", ...
 */
function addOrdinalSuffix(day: number) {
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

export function getDefaultDateRange(): DateRange {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 3);
  return { startDate, endDate };
}

export function formatDateRange({ startDate, endDate }: DateRange): string {
  const monthOptions: Intl.DateTimeFormatOptions = {
    month: 'long',
  };

  const startDay = startDate.getDate();
  const startMonth = startDate.toLocaleString('en-US', monthOptions);
  const startYear = startDate.getFullYear();

  const endDay = endDate.getDate();
  const endMonth = endDate.toLocaleString('en-US', monthOptions);
  const endYear = endDate.getFullYear();

  const startDayOrdinal = addOrdinalSuffix(startDay);
  const endDayOrdinal = addOrdinalSuffix(endDay);

  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDayOrdinal} - ${endDayOrdinal} ${startYear}`;
  }

  return (
    `${startMonth} ${startDayOrdinal} ${startYear} - ` +
    `${endMonth} ${endDayOrdinal} ${endYear}`
  );
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getInclusiveDaySpan({ startDate, endDate }: DateRange): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < start) {
    return 1;
  }

  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / MS_PER_DAY) + 1;
}
