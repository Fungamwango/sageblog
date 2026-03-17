export function setMeta({ title, description, url, image, type = 'website', publishedAt, modifiedAt } = {}) {
  const siteTitle = 'SageBlog';
  const fullTitle = title ? `${title} — ${siteTitle}` : siteTitle;
  const canonical = url || window.location.href;

  document.title = fullTitle;
  setTag('meta', 'name', 'description', 'content', description || '');
  setTag('link', 'rel', 'canonical', 'href', canonical);

  // Open Graph
  setTag('meta', 'property', 'og:title', 'content', fullTitle);
  setTag('meta', 'property', 'og:description', 'content', description || '');
  setTag('meta', 'property', 'og:url', 'content', canonical);
  setTag('meta', 'property', 'og:type', 'content', type);
  setTag('meta', 'property', 'og:site_name', 'content', siteTitle);
  if (image) setTag('meta', 'property', 'og:image', 'content', image);

  // Twitter Card
  setTag('meta', 'name', 'twitter:card', 'content', 'summary_large_image');
  setTag('meta', 'name', 'twitter:title', 'content', fullTitle);
  setTag('meta', 'name', 'twitter:description', 'content', description || '');

  // Remove old JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => s.remove());
}

export function injectArticleLD({ title, description, url, image, publishedAt, modifiedAt, authorName = 'SageBlog AI' } = {}) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    image: image ? [image] : undefined,
    datePublished: publishedAt,
    dateModified: modifiedAt || publishedAt,
    author: { '@type': 'Organization', name: 'SageBlog', url: 'https://sageblog.cfd' },
    publisher: {
      '@type': 'Organization',
      name: 'SageBlog',
      url: 'https://sageblog.cfd',
      logo: { '@type': 'ImageObject', url: 'https://sageblog.cfd/favicon.ico' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };
  injectLD(ld);
}

export function injectSiteLD() {
  injectLD({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SageBlog',
    url: 'https://sageblog.cfd',
    description: 'AI-powered blog covering technology, science, business, health, culture, and environment.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://sageblog.cfd/?search={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  });
}

function injectLD(data) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function setTag(tag, attrKey, attrVal, prop, val) {
  let el = document.querySelector(`${tag}[${attrKey}="${attrVal}"]`);
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(attrKey, attrVal);
    document.head.appendChild(el);
  }
  el.setAttribute(prop, val);
}
