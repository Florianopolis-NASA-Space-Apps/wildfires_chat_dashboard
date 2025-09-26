import { ExternalLink, GitHub } from 'react-feather';
import { Button } from '../button/Button';
import { GITHUB_REPO_URL } from '../../constants/links';

const LOGO_IMAGE_SIZE = 130;

interface ConsoleHeaderProps {
  isLargeScreen: boolean;
  onOpenSlideDeck: () => void;
}

export function ConsoleHeader({
  isLargeScreen,
  onOpenSlideDeck,
}: ConsoleHeaderProps) {
  return (
    <div className="content-top">
      <div className="content-title">
        <img
          src="/logo_fires_satellites.png"
          style={{
            width: LOGO_IMAGE_SIZE,
            height: LOGO_IMAGE_SIZE,
            marginLeft: -30,
            marginRight: -10,
          }}
          alt="Project logo"
        />
        <div>
          <div>
            <span style={{ fontSize: 50, fontWeight: 700 }}>{'GROW'}</span>
          </div>
          <span style={{ fontSize: isLargeScreen ? 20 : 14 }}>
            {'Global Recovery and Observation of Wildfires'}
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
            style={{ fontSize: 14, textAlign: 'right' }}
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
            style={{ fontSize: 14, textAlign: 'right' }}
            label="Presentation"
            onClick={onOpenSlideDeck}
          />
        </div>
      )}
      <img
        src="/nasa-logo.png"
        style={{ width: LOGO_IMAGE_SIZE, height: LOGO_IMAGE_SIZE }}
        alt="NASA logo"
      />
    </div>
  );
}
