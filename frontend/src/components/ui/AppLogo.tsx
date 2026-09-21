'use client';

import React, { memo, useMemo } from 'react';
import AppIcon from './AppIcon';

interface AppLogoProps {
  src?: string; // Image source (optional)
  variant?: 'shield' | 'full' | 'wordmark' | 'icon'; // Pragna variant
  iconName?: string; // Icon name when no image
  size?: number; // Size for icon/image (height for full/wordmark, square dimension for shield/icon)
  className?: string; // Additional classes
  onClick?: () => void; // Click handler
}

const AppLogo = memo(function AppLogo({
  src,
  variant = 'shield',
  iconName = 'SparklesIcon',
  size = 40,
  className = '',
  onClick,
}: AppLogoProps) {
  // Determine source image based on variant or custom src
  const imageSrc = useMemo(() => {
    if (src) return src;
    switch (variant) {
      case 'full':
        return '/pragna-logo-full.png';
      case 'wordmark':
        return '/pragna-wordmark.png';
      case 'icon':
        return '/pragna-logo-icon.png';
      case 'shield':
      default:
        return '/pragna-shield-icon.png';
    }
  }, [src, variant]);

  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['inline-flex items-center justify-center select-none bg-transparent'];
    if (onClick) classes.push('cursor-pointer hover:opacity-85 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  // Aspect ratio calculation for horizontal variants
  const { width, height } = useMemo(() => {
    if (variant === 'full') {
      // 320 x 89 ~ 3.595:1
      return { width: Math.round(size * 3.6), height: size };
    }
    if (variant === 'wordmark') {
      // 215 x 26 ~ 8.27:1
      return { width: Math.round(size * 8.27), height: size };
    }
    return { width: size, height: size };
  }, [variant, size]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="PRAGNA 1-A"
          width={width}
          height={height}
          className="flex-shrink-0 object-contain bg-transparent select-none filter drop-shadow-[0_2px_12px_rgba(212,175,55,0.22)]"
          style={{ width: `${width}px`, height: `${height}px` }}
          loading="eager"
          decoding="async"
        />
      ) : (
        <AppIcon name={iconName} size={size} className="flex-shrink-0" />
      )}
    </div>
  );
});

export default AppLogo;

