/**
 * Reverse geocoding — keyless BigDataCloud endpoint (same provider the
 * customer web app uses), so no maps API key is needed on this side either.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('reverse-geocode-failed');
  const d = await res.json();

  const area: string | null = d.locality || null;
  const city: string | null = d.city || d.locality || null;
  const state: string | null = d.principalSubdivision || null;
  const pincode: string | null = d.postcode || null;

  return [area, city !== area ? city : null, state, pincode]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(', ');
}
