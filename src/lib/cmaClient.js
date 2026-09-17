import axios from 'axios';
import { cmaBaseUrl } from './regions.js';

// Direct, authenticated CMA client for Entry Metadata. appSdk.metadata's built-in methods
// route through the web app's own internal domain (eu-app.contentstack.com/api/v3/...),
// not the real public CMA (eu-api.contentstack.com/v3/...) — confirmed against a live
// stack: writes via the SDK bridge return 200 and read back fine through that same
// bridge, but never propagate to what CDA or a direct CMA call actually see. A manual
// POST straight to the real CMA host works immediately, no separate publish step needed.
// So metadata specifically bypasses the SDK bridge and calls the real CMA host directly.
export function createCmaClient({ apiKey, managementToken, region }) {
  return axios.create({
    baseURL: cmaBaseUrl(region),
    headers: {
      api_key: apiKey,
      authorization: managementToken,
      'Content-Type': 'application/json'
    }
  });
}
