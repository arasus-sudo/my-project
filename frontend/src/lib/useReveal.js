import { useEffect, useRef, useState } from "react";

/** Scroll-triggered reveal — mirrors evolt.dev's Framer fade+slide-up-on-
 * enter pattern using a plain IntersectionObserver (no animation library).
 * Fires once, then disconnects; respects prefers-reduced-motion by simply
 * rendering visible from the start (no observer needed). */
export function useReveal(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px", ...options }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [ref, visible];
}
