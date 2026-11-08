const CACHE_NAME = 'hihibooth-frame-cache-v1'

/**
 * Vendor HihiBooth caches frame PNGs for offline use through desktopOfflineAsset.
 * In the Vue/Electron renderer we use the Cache API as the browser-side equivalent.
 */
export async function cacheFrameUrl(url: string): Promise<string> {
  if (!url) return url
  if (typeof caches === 'undefined') return url

  try {
    const cache = await caches.open(CACHE_NAME)
    let response = await cache.match(url)
    if (!response) {
      response = await fetch(url, { mode: 'cors' })
      if (response.ok) {
        await cache.put(url, response.clone())
      } else {
        return url
      }
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch {
    return url
  }
}

export async function clearFrameCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(CACHE_NAME)
}
