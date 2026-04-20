/** True when this document is inside a frame (including cross-origin parents). */
export function isEmbeddedInIframe(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
