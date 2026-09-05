import type { MetadataRoute } from 'next';

/**
 * Tell every crawler to stay out of the entire admin app.
 *
 * The real gate is Cloudflare Access — a crawler cannot authenticate, so it
 * never reaches a page here. This is defense in depth: if the app is ever
 * exposed without Access for a moment (a misconfigured route, a staging leak),
 * a compliant crawler still will not index it and cannot hand the URL to a
 * search engine or an AI assistant for an attacker to find.
 *
 * Named bots are listed as well as '*', because the well-behaved AI crawlers
 * honour their own user-agent rules and being explicit leaves no ambiguity.
 */
export default function robots(): MetadataRoute.Robots {
  const block = { disallow: '/' };
  return {
    rules: [
      { userAgent: '*', ...block },
      { userAgent: 'GPTBot', ...block },
      { userAgent: 'ChatGPT-User', ...block },
      { userAgent: 'OAI-SearchBot', ...block },
      { userAgent: 'Google-Extended', ...block },
      { userAgent: 'CCBot', ...block },
      { userAgent: 'ClaudeBot', ...block },
      { userAgent: 'anthropic-ai', ...block },
      { userAgent: 'PerplexityBot', ...block },
      { userAgent: 'Bytespider', ...block },
    ],
  };
}
