import React, { useRef, useEffect } from 'react';
import { COLORS } from '../../constants/colors';

interface SpinnerProps {
  /** Diameter of the spinner in pixels */
  size?: number;
  /** The color of the spinner’s border */
  color?: string;
  /** The speed of one full rotation in milliseconds */
  speed?: number;
  /** Additional styles to apply to the spinner */
  style?: React.CSSProperties;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 40,
  color = COLORS.neutral400,
  speed = 1000,
  style,
}) => {
  const spinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const rotateSpinner = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;

      // Calculate how far we've rotated: (elapsed / speed) of a full 360°.
      const rotation = (elapsed / speed) * 360;

      if (spinnerRef.current) {
        spinnerRef.current.style.transform = `rotate(${rotation}deg)`;
      }

      // Continue the animation:
      animationFrameId = requestAnimationFrame(rotateSpinner);
    };

    // Start animation:
    animationFrameId = requestAnimationFrame(rotateSpinner);

    // Clean up on unmount:
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [speed]);

  return (
    <div
      ref={spinnerRef}
      style={{
        ...style,
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        aspectRatio: '1 / 1',
        border: `4px solid ${color}`,
        borderTop: '4px solid transparent',
        borderRadius: '50%',
        boxSizing: 'border-box',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
};
