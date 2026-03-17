const API_BASE = 'https://api.sageblog.cfd';

/** Extract the first image URL and first video URL from HTML content. */
export function extractMedia(htmlContent) {
  if (!htmlContent) return { image: null, video: null };
  const imgMatch = htmlContent.match(/<img[^>]+src="([^"]+)"/i);
  const vidMatch = htmlContent.match(/<video[^>]+src="([^"]+)"/i);
  const image = imgMatch ? (imgMatch[1].startsWith('/images/') ? API_BASE + imgMatch[1] : imgMatch[1]) : null;
  const video = vidMatch ? (vidMatch[1].startsWith('/images/') ? API_BASE + vidMatch[1] : vidMatch[1]) : null;
  return { image, video };
}

export function setMeta({ title, description, url, image, video, type = 'website' } = {}) {
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
  setTag('meta', 'property', 'og:type', 'content', video ? 'video.other' : type);
  setTag('meta', 'property', 'og:site_name', 'content', siteTitle);
  if (image) {
    setTag('meta', 'property', 'og:image', 'content', image);
    setTag('meta', 'property', 'og:image:width', 'content', '1200');
    setTag('meta', 'property', 'og:image:height', 'content', '630');
  }
  if (video) {
    setTag('meta', 'property', 'og:video', 'content', video);
    setTag('meta', 'property', 'og:video:type', 'content', 'video/mp4');
  }

  // Twitter Card
  const twitterCard = image ? 'summary_large_image' : 'summary';
  setTag('meta', 'name', 'twitter:card', 'content', twitterCard);
  setTag('meta', 'name', 'twitter:title', 'content', fullTitle);
  setTag('meta', 'name', 'twitter:description', 'content', description || '');
  if (image) setTag('meta', 'name', 'twitter:image', 'content', image);
  if (video) setTag('meta', 'name', 'twitter:player', 'content', video);

  // Remove old JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => s.remove());
}

export function injectArticleLD({ title, description, url, image, video, publishedAt, modifiedAt } = {}) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': video ? 'VideoObject' : 'Article',
    headline: title,
    name: title,
    description,
    url,
    image: image ? [image] : undefined,
    contentUrl: video || undefined,
    embedUrl: video || undefined,
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
