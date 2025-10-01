import { useEffect, useCallback, useMemo, useState } from 'react';
import { MBox, IMapCoords, MapMarkerDetails } from '../mbox/MBox';
import { RealtimeVoiceModal } from '../realtime-voice/RealtimeVoiceModal';
import { DateRangeModal } from '../date-range/DateRangeModal';
import {
  formatDateForRequest,
  getDefaultDateRange,
  getInclusiveDaySpan,
  type DateRange,
} from '../../utils/dates';
import type { BoundingBoxObservationStats } from '../../utils/wildfireDb';
import { ConsoleHeader } from '../console-header/ConsoleHeader';
import { HackathonWinners } from '../hackathon-winners/HackathonWinners';
import { MapInformationOverlay } from '../map-information-overlay/MapInformationOverlay';
import { SlideDeckLightbox } from '../slide-deck-lightbox/SlideDeckLightbox';
import { SLIDE_DECK_URL } from '../../constants/links';
import { ConsoleFooter } from '../console-footer/ConsoleFooter';
import { MapLoadingModal } from '../map-loading-modal/MapLoadingModal';
import './dashboard.scss';

export function Dashboard() {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
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
  const [observationCount, setObservationCount] = useState<number | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() =>
    getDefaultDateRange({ daysBack: 2 })
  );
  const isLargeScreen = windowWidth >= 950;

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

  const handleObservationCountChange = useCallback((count: number | null) => {
    setObservationCount(count);
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
      // open SLIDE_DECK_URL in new tab
      window.open(SLIDE_DECK_URL, '_blank');
    }
  }, [isLargeScreen]);

  return (
    <div data-component="Dashboard">
      <ConsoleHeader
        isLargeScreen={isLargeScreen}
        onOpenSlideDeck={openSlideDeck}
      />
      <div className="content-main">
        <div className="content-right">
          <div className="content-block map" style={{ height: '100%' }}>
            <MBox
              isLargeScreen={isLargeScreen}
              setIsLoading={setIsLoading}
              focusCoords={mapPosition}
              marker={markerInfo}
              numberOfDays={selectedNumberOfDays}
              startDate={selectedStartDate}
              onObservationCountChange={handleObservationCountChange}
            />
            <MapLoadingModal state={loadingModalState} />
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
                observationCount={observationCount}
              />
            )}
          </div>
        </div>
        <ConsoleFooter
          isLargeScreen={isLargeScreen}
          onOpenSlideDeck={openSlideDeck}
        />
      </div>
      <SlideDeckLightbox
        isOpen={isLightboxOpen}
        slideDeckUrl={SLIDE_DECK_URL}
        onClose={closeLightbox}
      />
    </div>
  );
}
