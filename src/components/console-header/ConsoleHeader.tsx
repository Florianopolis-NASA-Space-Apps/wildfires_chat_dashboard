import { ExternalLink, GitHub } from 'react-feather';
import { Button } from '../button/Button';
import {
  GITHUB_REPO_URL,
  NASA_SPACE_APPS_WINNERS_URL,
} from '../../constants/links';

const SMALL_LOGO_SIZE = 80;
const LOGO_IMAGE_SIZE = 130;

interface ConsoleHeaderProps {
  isLargeScreen: boolean;
  onOpenSlideDeck: () => void;
}

export function ConsoleHeader({
  isLargeScreen,
  onOpenSlideDeck,
}: ConsoleHeaderProps) {
  const logoSize = isLargeScreen ? LOGO_IMAGE_SIZE : SMALL_LOGO_SIZE;
  const handleCardClick = () => {
    window.open(NASA_SPACE_APPS_WINNERS_URL, '_blank');
  };
  return (
    <div className="content-top">
      <div className="content-title">
        <img
          src="/logo_fires_satellites.png"
          style={{
            width: logoSize,
            height: logoSize,
            marginLeft: -30,
            marginRight: -10,
          }}
          alt="Project logo"
        />
        <div>
          <div>
            <span
              style={{
                fontSize: 50,
                fontWeight: 700,
                color: 'var(--color-white)',
                display: 'block',
                marginBottom: -8,
                marginLeft: -4,
              }}
            >
              {'GROW'}
            </span>
          </div>
          <span
            style={{
              fontSize: isLargeScreen ? 20 : 14,
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            {'Global Recovery & Observation of Wildfires'}
          </span>
        </div>
      </div>
      {isLargeScreen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <Button
            icon={GitHub}
            iconPosition="end"
            buttonStyle="flush"
            style={{ fontSize: 14, textAlign: 'right', margin: 2 }}
            label="Codebase"
            onClick={() => {
              const newWindow = window.open(
                GITHUB_REPO_URL,
                '_blank',
                'noopener,noreferrer'
              );
              if (newWindow) {
                newWindow.opener = null;
              }
            }}
          />
          <Button
            icon={ExternalLink}
            iconPosition="end"
            buttonStyle="flush"
            style={{ fontSize: 14, textAlign: 'right', margin: 2 }}
            label="Presentation"
            onClick={onOpenSlideDeck}
          />
        </div>
      )}
      <img
        src="/nasa-logo.png"
        onClick={handleCardClick}
        style={{
          width: logoSize,
          height: logoSize,
          pointerEvents: 'all',
          cursor: 'pointer',
        }}
        alt="NASA logo"
      />
    </div>
  );
}
