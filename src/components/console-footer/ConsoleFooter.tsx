import { ExternalLink, GitHub } from 'react-feather';
import { Button } from '../button/Button';
import { COLORS } from '../../constants/colors';
import { GITHUB_REPO_URL } from '../../constants/links';

interface ConsoleFooterProps {
  isLargeScreen: boolean;
  onOpenSlideDeck: () => void;
}

export function ConsoleFooter({
  isLargeScreen,
  onOpenSlideDeck,
}: ConsoleFooterProps) {
  if (isLargeScreen) {
    return null;
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-between',
      }}
    >
      <Button
        icon={GitHub}
        iconPosition="end"
        style={{
          fontSize: 16,
          textAlign: 'center',
          backgroundColor: COLORS.sand,
          alignSelf: 'flex-end',
        }}
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
        style={{
          fontSize: 16,
          textAlign: 'center',
          backgroundColor: COLORS.sand,
          alignSelf: 'flex-end',
        }}
        label={`Presentation`}
        onClick={onOpenSlideDeck}
      />
    </div>
  );
}
