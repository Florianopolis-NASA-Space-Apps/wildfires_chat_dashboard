import { MouseEvent } from 'react';
import { X } from 'react-feather';

interface HackathonWinnersProps {
  isVisible: boolean;
  onDismiss: () => void;
}

const WINNERS_ARTICLE_URL =
  'https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/';

export function HackathonWinners({
  isVisible,
  onDismiss,
}: HackathonWinnersProps) {
  if (!isVisible) {
    return null;
  }

  const handleCardClick = () => {
    window.open(WINNERS_ARTICLE_URL, '_blank');
  };

  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDismiss();
  };

  return (
    <div
      className="map-space-apps-modal"
      role="status"
      aria-live="polite"
      onClick={handleCardClick}
    >
      <button
        type="button"
        className="map-space-apps-close"
        onClick={handleCloseClick}
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
  );
}
