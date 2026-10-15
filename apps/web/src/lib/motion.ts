import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

/** Whether the element is on screen, so demos can pause their timers when it isn't. */
export function useInView(ref: RefObject<Element | null>, threshold = 0) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold },
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

const REDUCE = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}
