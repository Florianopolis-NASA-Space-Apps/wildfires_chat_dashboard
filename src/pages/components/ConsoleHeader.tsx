import { ExternalLink } from 'react-feather';
import { Button } from '../../components/button/Button';

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
            label="Presentation Slide Deck"
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
