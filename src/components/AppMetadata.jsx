
import React from 'react';

export default function AppMetadata() {
  React.useEffect(() => {
    // Create and inject PWA manifest
    const manifest = {
      name: "InvoiceBreek - Professional Invoicing",
      short_name: "InvoiceBreek",
      description: "Professional invoicing solution for businesses",
      start_url: "/",
      display: "standalone",
      background_color: "#1e40af",
      theme_color: "#1e40af",
      orientation: "portrait-primary",
      icons: [
        {
          src: "/Logo icon.png",
          sizes: "any",
          type: "image/png",
          purpose: "any maskable"
        }
      ],
      categories: ["business", "finance", "productivity"],
      shortcuts: [
        {
          name: "Create Invoice",
          short_name: "New Invoice",
          description: "Create a new invoice",
          url: "/CreateInvoice",
          icons: [
            {
              src: "/Logo icon.png",
              sizes: "any"
            }
          ]
        },
        {
          name: "Dashboard",
          short_name: "Dashboard",
          description: "View dashboard",
          url: "/Dashboard",
          icons: [
            {
              src: "/Logo icon.png",
              sizes: "any"
            }
          ]
        }
      ]
    };

    // Create manifest blob and URL
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    // Create and inject manifest link
    let manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestUrl;

    // Add meta tags for PWA
    const metaTags = [
      { name: 'application-name', content: 'InvoiceBreek' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'InvoiceBreek' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'msapplication-TileColor', content: '#1e40af' },
      { name: 'msapplication-tap-highlight', content: 'no' },
      { property: 'og:title', content: 'InvoiceBreek - Professional Invoicing' },
      { property: 'og:description', content: 'Professional invoicing solution for businesses' },
      { property: 'og:image', content: '/Logo icon.png' }
    ];

    metaTags.forEach(({ name, property, content }) => {
      const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
      let meta = document.querySelector(selector);
      if (!meta) {
        meta = document.createElement('meta');
        if (name) meta.name = name;
        if (property) meta.property = property;
        document.head.appendChild(meta);
      }
      meta.content = content;
    });

    // Add apple touch icons
    const appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    appleTouchIcon.href = '/Logo icon.png';
    document.head.appendChild(appleTouchIcon);

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      // Create a simple service worker
      const swCode = `
        const CACHE_NAME = 'invoicebreek-v1';
        const urlsToCache = [
          '/',
          '/Dashboard',
          '/CreateInvoice',
          '/Clients',
          '/Services',
          '/Invoices',
          '/Settings'
        ];

        self.addEventListener('install', event => {
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then(cache => cache.addAll(urlsToCache))
          );
        });

        self.addEventListener('fetch', event => {
          event.respondWith(
            caches.match(event.request)
              .then(response => {
                if (response) {
                  return response;
                }
                return fetch(event.request);
              })
          );
        });
      `;

      const swBlob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(swBlob);
      
      navigator.serviceWorker.register(swUrl)
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
    }

    // Cleanup function
    return () => {
      URL.revokeObjectURL(manifestUrl);
    };
  }, []);

  return null;
}
