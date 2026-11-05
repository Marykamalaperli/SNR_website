import { useEffect } from 'react';

export default function usePageMeta(title, description, privatePage = false) {
  useEffect(() => {
    document.title = `${title} — SNR NEST`;
    function setMeta(attribute, key, content) {
      let meta = document.querySelector(`meta[${attribute}="${key}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.append(meta);
      }
      meta.content = content;
    }
    setMeta('name', 'description', description);
    setMeta('name', 'robots', privatePage ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', document.title);
    setMeta('property', 'og:description', description);
    if (privatePage) {
      document.querySelector('link[rel="canonical"]')?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    } else {
      const origin = document.querySelector('meta[name="snr-site-origin"]')?.content;
      if (origin) {
        const canonical =
          document.querySelector('link[rel="canonical"]') || document.createElement('link');
        canonical.rel = 'canonical';
        canonical.href = `${origin}/`;
        document.head.append(canonical);
        setMeta('property', 'og:url', `${origin}/`);
      }
    }
  }, [title, description, privatePage]);
}
