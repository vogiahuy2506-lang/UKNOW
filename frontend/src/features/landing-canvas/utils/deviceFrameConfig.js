/**
 * Device dimensions cho preview iframe.
 * Reference từ ui.corr.sh ResponsivePreviewShell.
 */
import {
  HiOutlineDesktopComputer,
  HiOutlineDeviceTablet,
  HiOutlineDeviceMobile,
} from 'react-icons/hi';

export const DEVICES = {
  desktop: {
    key: 'desktop',
    width: 1280,
    height: 800,
    label: 'Desktop',
    icon: HiOutlineDesktopComputer,
  },
  tablet: {
    key: 'tablet',
    width: 768,
    height: 1024,
    label: 'Tablet',
    icon: HiOutlineDeviceTablet,
  },
  mobile: {
    key: 'mobile',
    width: 375,
    height: 667,
    label: 'Mobile',
    icon: HiOutlineDeviceMobile,
  },
};

export const DEFAULT_VIEWPORT = 'desktop';
export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.5;
export const ZOOM_STEP = 0.1;
