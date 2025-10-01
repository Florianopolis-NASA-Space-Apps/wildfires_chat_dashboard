import { Spinner } from '../spinner/Spinner';
import { COLORS } from '../../constants/colors';

type MapLoadingModalState = 'loading' | 'success' | 'hidden';

type MapLoadingModalProps = {
  state: MapLoadingModalState;
};

export function MapLoadingModal({ state }: MapLoadingModalProps) {
  if (state === 'hidden') {
    return null;
  }

  const isLoading = state === 'loading';

  return (
    <div
      className={`map-loading-modal map-loading-modal--${state}`}
      role="status"
      aria-live="polite"
    >
      {isLoading ? (
        <Spinner size={36} color={COLORS.skyBlue} />
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
        {isLoading
          ? 'Retrieving wildfire observations...'
          : 'Wildfire observations ready!'}
      </div>
    </div>
  );
}
