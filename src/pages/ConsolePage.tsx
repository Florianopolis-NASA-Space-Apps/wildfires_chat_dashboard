/**
 * You can connect directly to OpenAI by setting the following environment variables:
 * Optionally override the websocket endpoint with REACT_APP_OPENAI_REALTIME_URL=
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { ExternalLink } from 'react-feather';
import { Button } from '../components/button/Button';
import './ConsolePage.scss';
import { MBox, IMapCoords, MapMarkerDetails } from '../components/mbox/MBox';
import { Spinner } from '../components/spinner/Spinner';
import { RealtimeVoiceModal } from '../components/realtime-voice/RealtimeVoiceModal';
import { DateRangeModal } from '../components/date-range/DateRangeModal';
import {
  formatDateForRequest,
  getDefaultDateRange,
  getInclusiveDaySpan,
  type DateRange,
} from '../utils/dates';
import type { BoundingBoxObservationStats } from '../utils/wildfireDb';
import { COLORS } from '../constants/colors';
import { ConsoleHeader } from './components/ConsoleHeader';
import { HackathonWinners } from './components/HackathonWinners';
import { MapInformationOverlay } from './components/MapInformationOverlay';
import { SlideDeckLightbox } from './components/SlideDeckLightbox';

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
  const [dataMode, setDataMode] = useState<'live' | 'historical'>('live');
  const [isLoading, setIsLoading] = useState(true);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [markerInfo, setMarkerInfo] = useState<MapMarkerDetails | null>(null);
  const [hasInitialLoadStarted, setHasInitialLoadStarted] = useState(false);
  const [mapPosition, setMapPosition] = useState<IMapCoords | null>(null);
  const [isSpaceAppsModalVisible, setIsSpaceAppsModalVisible] = useState(true);
  const [isDatesMinimized, setIsDatesMinimized] = useState(true);
  const [loadingModalState, setLoadingModalState] = useState<
    'loading' | 'success' | 'hidden'
  >('loading');
  const [lastObservationQuery, setLastObservationQuery] = useState<
    string | null
  >(null);
  const [observationValue, setObservationValue] =
    useState<BoundingBoxObservationStats | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() =>
    getDefaultDateRange()
  );
  const isLargeScreen = windowWidth >= 654;

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

  const selectedStartDate = useMemo(
    () => formatDateForRequest(selectedDateRange.startDate),
    [selectedDateRange.startDate]
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLoading) {
      if (!hasInitialLoadStarted) {
        setHasInitialLoadStarted(true);
      }
      if (loadingModalState !== 'loading') {
        setLoadingModalState('loading');
      }
      return;
    }

    if (
      !isLoading &&
      hasInitialLoadStarted &&
      loadingModalState === 'loading'
    ) {
      setLoadingModalState('success');
    }
  }, [hasInitialLoadStarted, isLoading, loadingModalState]);

  useEffect(() => {
    if (loadingModalState !== 'success') {
      return;
    }
    const hideDelay = window.setTimeout(() => {
      setLoadingModalState('hidden');
    }, 1400);
    return () => window.clearTimeout(hideDelay);
  }, [loadingModalState]);

  const openSlideDeck = useCallback(() => {
    if (isLargeScreen) {
      setIsLightboxOpen(true);
    } else {
      // open SLIDE_DECK_LINK in new tab
      window.open(SLIDE_DECK_LINK, '_blank');
    }
  }, [isLargeScreen]);

  return (
    <div data-component="ConsolePage">
      <ConsoleHeader
        isLargeScreen={isLargeScreen}
        onOpenSlideDeck={openSlideDeck}
      />
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
              startDate={selectedStartDate}
            />
            {loadingModalState !== 'hidden' && (
              <div
                className={`map-loading-modal map-loading-modal--${loadingModalState}`}
                role="status"
                aria-live="polite"
              >
                {loadingModalState === 'loading' ? (
                  <Spinner size={36} color={COLORS.navy} />
                ) : (
                  <div className="map-loading-checkmark" aria-hidden="true">
                    <svg
                      className="map-loading-checkmark-icon"
                      viewBox="0 0 24 24"
                      focusable="false"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="map-loading-text">
                  {loadingModalState === 'loading'
                    ? 'Retrieving wildfire observations...'
                    : 'Wildfire observations ready!'}
                </div>
              </div>
            )}
            <HackathonWinners
              isVisible={isSpaceAppsModalVisible}
              onDismiss={dismissSpaceAppsModal}
            />
            {isLargeScreen && (
              <MapInformationOverlay
                markerInfo={markerInfo}
                observationValue={observationValue}
                lastObservationQuery={lastObservationQuery}
              />
            )}
            <RealtimeVoiceModal
              onMarkerUpdate={updateMarkerInfo}
              onMapPositionChange={setMapPosition}
              onObservationQueryChange={setLastObservationQuery}
              onObservationValueChange={setObservationValue}
              onResetContext={resetRealtimeContext}
              isLargeScreen={isLargeScreen}
              onDateRangeChange={applyDateRange}
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
        {!isLargeScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            style={{
              fontSize: 18,
              textAlign: 'center',
              backgroundColor: COLORS.sand,
              alignSelf: 'flex-end',
              marginTop: -10,
              marginBottom: -10,
            }}
            label={`Presentation Slide Deck`}
            onClick={openSlideDeck}
          />
        )}
      </div>
      <SlideDeckLightbox
        isOpen={isLightboxOpen}
        slideDeckUrl={SLIDE_DECK_LINK}
        onClose={closeLightbox}
      />
    </div>
  );
}
