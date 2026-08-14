import { useEffect } from 'react';

interface MetaTagsOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  robots?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const SITE_URL = 'https://mathlogs.app';

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export function useMetaTags({
  title,
  description,
  canonicalPath,
  image = `${SITE_URL}/dashboard.webp`,
  type = 'website',
  robots = 'index, follow, max-image-preview:large',
  structuredData
}: MetaTagsOptions) {
  useEffect(() => {
    const canonicalUrl = canonicalPath
      ? new URL(canonicalPath, SITE_URL).toString()
      : new URL(window.location.pathname, SITE_URL).toString();

    if (title) {
      document.title = title;
      upsertMeta('meta[name="title"]', 'name', 'title', title);
      upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
      upsertMeta('meta[property="twitter:title"]', 'property', 'twitter:title', title);
    }

    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
      upsertMeta('meta[property="twitter:description"]', 'property', 'twitter:description', description);
    }

    upsertMeta('meta[name="robots"]', 'name', 'robots', robots);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    upsertMeta('meta[property="twitter:url"]', 'property', 'twitter:url', canonicalUrl);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
    upsertMeta('meta[property="twitter:image"]', 'property', 'twitter:image', image);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    document.querySelectorAll('script[data-mathlogs-seo="true"]').forEach(node => node.remove());
    if (structuredData) {
      const items = Array.isArray(structuredData) ? structuredData : [structuredData];
      items.forEach(item => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.mathlogsSeo = 'true';
        script.text = JSON.stringify(item).replace(/</g, '\\u003c');
        document.head.appendChild(script);
      });
    }

    return () => {
      document.querySelectorAll('script[data-mathlogs-seo="true"]').forEach(node => node.remove());
    };
  }, [title, description, canonicalPath, image, type, robots, structuredData]);
}
