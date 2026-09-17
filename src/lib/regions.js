// CMA base URLs per Contentstack region, keyed by appSdk.getCurrentRegion()'s exact enum
// strings (NA/EU/AZURE_NA/AZURE_EU) so the region can be auto-detected — no config needed.
export const CMA_BASE_URLS = {
  NA: 'https://api.contentstack.io',
  EU: 'https://eu-api.contentstack.com',
  AZURE_NA: 'https://azure-na-api.contentstack.com',
  AZURE_EU: 'https://azure-eu-api.contentstack.com'
};

export function cmaBaseUrl(region) {
  return CMA_BASE_URLS[region] || CMA_BASE_URLS.NA;
}
