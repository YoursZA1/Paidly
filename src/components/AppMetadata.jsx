import React from 'react';

/**
 * Document-level metadata that is not already in index.html.
 * Manifest, theme-color, apple-touch-icon, and the service worker live in
 * index.html + vite-plugin-pwa. Do not register or unregister a SW here —
 * a previous blob-manifest + cache-first SW served stale HTML after deploys.
 */
export default function AppMetadata() {
  React.useEffect(() => {
    const ensureMeta = (attrs) => {
      const selector = attrs.name
        ? `meta[name="${attrs.name}"]`
        : `meta[property="${attrs.property}"]`;
      let meta = document.querySelector(selector);
      if (!meta) {
        meta = document.createElement('meta');
        if (attrs.name) meta.name = attrs.name;
        if (attrs.property) meta.property = attrs.property;
        document.head.appendChild(meta);
      }
      if (attrs.content) meta.content = attrs.content;
    };

    ensureMeta({ name: 'application-name', content: 'Paidly' });
    ensureMeta({ name: 'theme-color', content: '#f24e00' });
    ensureMeta({ name: 'apple-mobile-web-app-capable', content: 'yes' });
    ensureMeta({ name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    ensureMeta({ name: 'apple-mobile-web-app-title', content: 'Paidly' });
    ensureMeta({ name: 'mobile-web-app-capable', content: 'yes' });
    ensureMeta({ name: 'msapplication-TileColor', content: '#f24e00' });
  }, []);

  return null;
}
