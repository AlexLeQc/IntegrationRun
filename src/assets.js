/**
 * Asset Preloader Module for Neon Runner
 * Asynchronously loads image assets from public/assets/.
 * Returns null for any asset that fails to load (404/missing), triggering seamless procedural rendering fallback.
 */

const DEFAULT_ASSET_PATHS = {
  player: '/assets/player.png',
  barrier: '/assets/barrier.png',
  hurdle: '/assets/hurdle.png',
  beam: '/assets/beam.png',
  obstacle: '/assets/obstacle.png',
  coin: '/assets/coin.png',
  background: '/assets/background.png'
};

export async function loadAssets(paths = DEFAULT_ASSET_PATHS) {
  const loadedAssets = {};

  const loadPromises = Object.entries(paths).map(([key, url]) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedAssets[key] = img;
        resolve();
      };
      img.onerror = () => {
        // Gracefully set to null on 404/error for procedural fallback
        loadedAssets[key] = null;
        resolve();
      };
    });
  });

  await Promise.all(loadPromises);
  return loadedAssets;
}
