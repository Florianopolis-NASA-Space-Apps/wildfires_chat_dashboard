/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */

import { useEffect, useCallback, useState } from 'react';

import { X, ExternalLink } from 'react-feather';
import { Button } from '../components/button/Button';

import './ConsolePage.scss';
import { IMapCoords, MBox } from '../components/mbox/MBox';
import { Spinner } from '../components/spinner/Spinner';

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

  const SmallButtons = (
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
        <div>
          <p
            style={{
              minWidth: 180,
              fontWeight: dataMode === 'live' ? 'bold' : 'normal',
            }}
          >
            {isLoading ? <Spinner size={30} /> : `${getDateRangeString()}`}
          </p>
        </div>
      </div>
    </div>
  );

  const LargeButtons = (
    <div className="content-logs">
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
        <div>
          <p
            style={{
              minWidth: 180,
              fontWeight: dataMode === 'live' ? 'bold' : 'normal',
            }}
          >
            {isLoading ? <Spinner /> : `${getDateRangeString()}`}
          </p>
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
              <span style={{ fontSize: 50 }}>GROW</span>
            </div>
            <span style={{ fontSize: isLargeScreen ? 20 : 14 }}>
              Global Recovery and Observation of Wildfires
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
            <MBox dataMode={dataMode} setIsLoading={setIsLoading} />
          </div>
        </div>
        {isLargeScreen ? LargeButtons : SmallButtons}
        {!isLargeScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            // buttonStyle="flush"
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
