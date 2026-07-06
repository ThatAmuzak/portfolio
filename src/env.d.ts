/// <reference types="astro/client" />

declare function scrollToTarget(target: HTMLElement | number): void;

interface Window {
  initCardTilt?: () => void;
}
