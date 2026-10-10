import type { DesktopApi } from '../../shared/desktop-api';

declare global {
  interface Window {
    bcis?: DesktopApi;
  }
}

export {};
