/**
 * The drive never zooms. On iPhones two thumbs on the controls (steer + accelerator) could be read as a pinch, or two
 * quick taps as a double-tap zoom, and the page stayed zoomed with no way back (players and the owner hit it in
 * landscape). CSS touch-action alone doesn't stop Safari / WKWebView, so: Safari's own pinch events are cancelled, a
 * second finger's move never scrolls or zooms the page, and if the page does end up zoomed it is snapped back to 1×
 * (re-setting the viewport's maximum-scale makes iOS reset it). The iPhone app also turns zoom off natively
 * (ios-app GameViewController). Returns the undo, for the drive page's effect.
 */
export function guardZoom() {
  if (typeof window === "undefined") return () => {};
  const stop = (e: Event) => e.preventDefault();
  const twoFingers = (e: TouchEvent) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); };
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const base = meta?.content ?? "width=device-width, initial-scale=1";
  let resetting = false;
  const snapBack = () => {
    const vv = window.visualViewport;
    if (!meta || !vv || resetting || vv.scale <= 1.01) return;
    resetting = true;
    meta.content = `${base}, initial-scale=1, maximum-scale=1`;
    setTimeout(() => { meta.content = `${base}, maximum-scale=1`; resetting = false; window.scrollTo(0, 0); }, 60);
  };
  if (meta && !/maximum-scale/.test(base)) meta.content = `${base}, maximum-scale=1`;
  document.addEventListener("gesturestart", stop, { passive: false });
  document.addEventListener("gesturechange", stop, { passive: false });
  document.addEventListener("dblclick", stop, { passive: false });
  document.addEventListener("touchmove", twoFingers, { passive: false });
  window.visualViewport?.addEventListener("resize", snapBack);
  const timer = setInterval(snapBack, 1000); // (in case the resize event doesn't come)
  return () => {
    document.removeEventListener("gesturestart", stop);
    document.removeEventListener("gesturechange", stop);
    document.removeEventListener("dblclick", stop);
    document.removeEventListener("touchmove", twoFingers);
    window.visualViewport?.removeEventListener("resize", snapBack);
    clearInterval(timer);
    if (meta) meta.content = base;
  };
}
