const AMAZON_MARKETPLACE_HOSTS: Record<string, string> = {
  AE: 'amazon.ae',
  AU: 'amazon.com.au',
  BE: 'amazon.com.be',
  BR: 'amazon.com.br',
  CA: 'amazon.ca',
  DE: 'amazon.de',
  EG: 'amazon.eg',
  ES: 'amazon.es',
  FR: 'amazon.fr',
  GB: 'amazon.co.uk',
  IE: 'amazon.ie',
  IN: 'amazon.in',
  IT: 'amazon.it',
  JP: 'amazon.co.jp',
  MX: 'amazon.com.mx',
  NL: 'amazon.nl',
  PL: 'amazon.pl',
  SA: 'amazon.sa',
  SE: 'amazon.se',
  SG: 'amazon.sg',
  TR: 'amazon.com.tr',
  UK: 'amazon.co.uk',
  US: 'amazon.com',
  ZA: 'amazon.co.za',
};

const DEFAULT_AMAZON_MARKETPLACE_HOST = 'amazon.com';

export const getAmazonMarketplaceHost = (countryCode?: string | null) => {
  const normalizedCountryCode = countryCode?.trim().toUpperCase();
  return normalizedCountryCode
    ? AMAZON_MARKETPLACE_HOSTS[normalizedCountryCode] || DEFAULT_AMAZON_MARKETPLACE_HOST
    : DEFAULT_AMAZON_MARKETPLACE_HOST;
};

export const buildAmazonSearchUrl = (query: string, countryCode?: string | null) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const host = getAmazonMarketplaceHost(countryCode);
  return `https://www.${host}/s?k=${encodeURIComponent(trimmedQuery)}`;
};
