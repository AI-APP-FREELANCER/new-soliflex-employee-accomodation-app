import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive breakpoints
 * Returns object with breakpoint flags and screen size info
 */
export const useResponsive = () => {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoints = {
    // Mobile: < 576px
    isMobile: screenSize.width < 576,
    // Tablet: 576px - 768px
    isTablet: screenSize.width >= 576 && screenSize.width < 768,
    // Small Desktop: 768px - 992px
    isSmallDesktop: screenSize.width >= 768 && screenSize.width < 992,
    // Desktop: 992px - 1200px
    isDesktop: screenSize.width >= 992 && screenSize.width < 1200,
    // Large Desktop: >= 1200px
    isLargeDesktop: screenSize.width >= 1200,
    // Extra Large: >= 1920px
    isExtraLarge: screenSize.width >= 1920,
  };

  return {
    ...breakpoints,
    // Convenience flags
    isMobileOrTablet: screenSize.width < 768,
    isDesktopOrLarger: screenSize.width >= 768,
    screenSize,
  };
};

