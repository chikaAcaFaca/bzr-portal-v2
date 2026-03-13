/**
 * Company Images Service
 *
 * Generates image URLs for company profile pages:
 * 1. Google Street View Static API — real photo of the company location
 * 2. OpenStreetMap static map — location map
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/**
 * Build a full Serbian address string for geocoding
 */
function buildFullAddress(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}): string | null {
  const parts: string[] = [];
  if (data.adresa) parts.push(data.adresa);
  if (data.grad) parts.push(data.grad);
  else if (data.opstina) parts.push(data.opstina);
  if (data.postanskiBroj) parts.push(data.postanskiBroj);
  parts.push('Srbija');
  return parts.length > 1 ? parts.join(', ') : null;
}

/**
 * Generate Google Street View Static API URL
 * Free tier: 28,000 loads/month
 * Returns null if no API key configured or no address
 */
export function getStreetViewUrl(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}, options?: { width?: number; height?: number }): string | null {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const address = buildFullAddress(data);
  if (!address) return null;

  const width = options?.width || 600;
  const height = options?.height || 400;

  return `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&location=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
}

/**
 * Generate Google Street View metadata check URL
 * Use this to verify if a Street View image exists before showing it
 */
export function getStreetViewMetadataUrl(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}): string | null {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const address = buildFullAddress(data);
  if (!address) return null;

  return `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
}

/**
 * Generate OpenStreetMap static map URL using free OSM static map services
 * Uses osm-static-maps or a Leaflet-based embed approach
 */
export function getStaticMapUrl(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}, options?: { width?: number; height?: number; zoom?: number }): string | null {
  const address = buildFullAddress(data);
  if (!address) return null;

  const width = options?.width || 600;
  const height = options?.height || 300;
  const zoom = options?.zoom || 15;

  // Use Nominatim-powered static map via OSM embed
  // This generates a URL that the frontend can use for an iframe embed
  return `https://www.openstreetmap.org/export/embed.html?bbox=&layer=mapnik&marker=&query=${encodeURIComponent(address)}`;
}

/**
 * Generate OpenStreetMap search/link URL for the company location
 */
export function getMapLinkUrl(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}): string | null {
  const address = buildFullAddress(data);
  if (!address) return null;

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}

/**
 * Generate all image/map URLs for a company profile
 */
export function getCompanyImageUrls(data: {
  adresa?: string | null;
  grad?: string | null;
  opstina?: string | null;
  postanskiBroj?: string | null;
}): {
  streetViewUrl: string | null;
  streetViewMetadataUrl: string | null;
  mapEmbedUrl: string | null;
  mapLinkUrl: string | null;
} {
  return {
    streetViewUrl: getStreetViewUrl(data),
    streetViewMetadataUrl: getStreetViewMetadataUrl(data),
    mapEmbedUrl: getStaticMapUrl(data),
    mapLinkUrl: getMapLinkUrl(data),
  };
}
