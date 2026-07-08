import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import * as db from '../db/database';

const BUCKET = 'product-images';
// Persistent (non-cache) folder where restored images live.
const LOCAL_DIR = FileSystem.documentDirectory + 'product_images/';
// Local manifest of what we've already uploaded, so repeat backups skip
// unchanged photos. Keyed by productId → "size:modificationTime".
const MANIFEST_KEY = 'image_upload_manifest';

export type ImgProgress = (done: number, total: number) => void;

function isLocalFile(uri?: string | null): uri is string {
  return !!uri && uri.startsWith('file://');
}

async function loadManifest(): Promise<Record<string, string>> {
  const raw = await db.getSetting(MANIFEST_KEY);
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// Upload new/changed product images to the user's storage folder. Returns how
// many were actually uploaded (skipped-unchanged don't count).
export async function uploadProductImages(userId: string, onProgress?: ImgProgress): Promise<number> {
  if (!supabase) return 0;
  const products = await db.getAllProducts();
  const withImg = products.filter((p) => isLocalFile(p.imageUri));
  const manifest = await loadManifest();

  let done = 0;
  let uploaded = 0;
  for (const p of withImg) {
    try {
      const info = await FileSystem.getInfoAsync(p.imageUri!);
      if (info.exists && !info.isDirectory) {
        const sig = `${info.size}:${(info as any).modificationTime ?? 0}`;
        if (manifest[p.id] !== sig) {
          const b64 = await FileSystem.readAsStringAsync(p.imageUri!, { encoding: 'base64' });
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(`${userId}/${p.id}.jpg`, decode(b64), { contentType: 'image/jpeg', upsert: true });
          if (!error) { manifest[p.id] = sig; uploaded++; }
        }
      }
    } catch { /* skip individual image failures */ }
    done++;
    onProgress?.(done, withImg.length);
  }

  await db.setSetting(MANIFEST_KEY, JSON.stringify(manifest));
  return uploaded;
}

// Download images for restored products into a persistent local folder and
// rewrite each product's imageUri. `snapshotProducts` is the products array
// from the restored snapshot (its imageUri marks which products had a photo).
export async function downloadProductImages(
  userId: string,
  snapshotProducts: any[],
  onProgress?: ImgProgress,
): Promise<void> {
  if (!supabase) return;
  await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true }).catch(() => {});

  const withImg = (snapshotProducts || []).filter((p) => p?.imageUri);
  const manifest: Record<string, string> = {};
  let done = 0;
  for (const p of withImg) {
    let localUri = '';
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(`${userId}/${p.id}.jpg`, 120);
      if (!error && data?.signedUrl) {
        const dest = `${LOCAL_DIR}${p.id}.jpg`;
        const res = await FileSystem.downloadAsync(data.signedUrl, dest);
        if (res.status === 200) {
          localUri = dest;
          const info = await FileSystem.getInfoAsync(dest);
          if (info.exists) manifest[p.id] = `${info.size}:${(info as any).modificationTime ?? 0}`;
        }
      }
    } catch { /* leave localUri empty on failure */ }
    // Rewrite to the freshly downloaded path, or clear it (no broken file:// paths).
    await db.updateProductImageUri(p.id, localUri);
    done++;
    onProgress?.(done, withImg.length);
  }

  // Seed the upload manifest so the next backup won't re-upload what we just pulled.
  await db.setSetting(MANIFEST_KEY, JSON.stringify(manifest));
}
