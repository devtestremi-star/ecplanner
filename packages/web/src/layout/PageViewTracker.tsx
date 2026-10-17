import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../analytics.js';

/** Une page vue par changement d'adresse : gtag seul ne voit pas la navigation d'une SPA. */
export function PageViewTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    trackPageView(pathname + search);
  }, [pathname, search]);
  return null;
}
