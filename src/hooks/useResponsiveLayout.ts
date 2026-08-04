// src/hooks/useResponsiveLayout.ts
import { useState, useEffect } from 'react';

export type ScreenDeviceCategory = 'compact-phone' | 'large-phone' | 'fold-tablet' | 'desktop';

export interface ResponsiveLayout {
  width: number;
  height: number;
  category: ScreenDeviceCategory;
  isMobile: boolean; // width < 768px
  isCompact: boolean; // width < 480px
  isTabletFold: boolean; // 768px <= width < 1024px
  isDesktop: boolean; // width >= 1024px
}

export function useResponsiveLayout(): ResponsiveLayout {
  const getLayout = (): ResponsiveLayout => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;

    let category: ScreenDeviceCategory = 'desktop';
    if (width < 480) {
      category = 'compact-phone';
    } else if (width < 768) {
      category = 'large-phone';
    } else if (width < 1024) {
      category = 'fold-tablet';
    } else {
      category = 'desktop';
    }

    return {
      width,
      height,
      category,
      isMobile: width < 768,
      isCompact: width < 480,
      isTabletFold: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
    };
  };

  const [layout, setLayout] = useState<ResponsiveLayout>(getLayout);

  useEffect(() => {
    const handleResize = () => {
      setLayout(getLayout());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return layout;
}
