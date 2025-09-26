import { MouseEvent } from 'react';
import { X } from 'react-feather';
import { NASA_SPACE_APPS_WINNERS_URL } from '../../constants/links';

interface HackathonWinnersProps {
  isVisible: boolean;
  onDismiss: () => void;
}

export function HackathonWinners({
  isVisible,
  onDismiss,
}: HackathonWinnersProps) {
  if (!isVisible) {
    return null;
  }

  const handleCardClick = () => {
    window.open(NASA_SPACE_APPS_WINNERS_URL, '_blank');
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
      <div
        className="map-space-apps-heading"
        style={{ fontWeight: 900, fontSize: 16 }}
      >
        {'2024 NASA Space Apps Challenge Winners'}
      </div>
      <div style={{ height: 10 }} />
      <div className="map-space-apps-subheading" style={{ fontWeight: 700 }}>
        {'🏆 Top 10 out of 10,000 Worldwide Projects (Top 1%)'}
      </div>
      <div style={{ height: 10 }} />
      <div className="map-space-apps-subheading" style={{ fontWeight: 600 }}>
        {'🇧🇷 Florianópolis, Brazil'}
      </div>
    </div>
  );
}
