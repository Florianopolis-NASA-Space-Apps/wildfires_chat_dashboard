import { X } from 'react-feather';

interface SlideDeckLightboxProps {
  isOpen: boolean;
  slideDeckUrl: string;
  onClose: () => void;
}

export function SlideDeckLightbox({
  isOpen,
  slideDeckUrl,
  onClose,
}: SlideDeckLightboxProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="slide-deck-lightbox">
      <div className="lightbox-content">
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close slide deck"
        >
          <X />
        </button>
        <iframe
          src={slideDeckUrl}
          frameBorder="0"
          width="960"
          height="569"
          allowFullScreen
          title="Presentation"
        />
      </div>
    </div>
  );
}
