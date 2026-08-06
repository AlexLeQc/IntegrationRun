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

export const DEFAULT_SOUND_PATHS = {
  coin: '/assets/coin.mp3',
  jump: '/assets/jump.mp3',
  slide: '/assets/slide.mp3',
  hit: '/assets/hit.mp3',
  shoot: '/assets/shoot.mp3',
  destroy: '/assets/destroy.mp3',
  click: '/assets/click.mp3',
  gameOver: '/assets/gameOver.mp3'
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

/**
 * Preloads audio file buffers asynchronously from public/assets/.
 * Returns a dictionary mapping sound names to AudioBuffers (or null if missing/failed).
 */
export async function loadAudioAssets(audioContext, paths = DEFAULT_SOUND_PATHS) {
  const loadedBuffers = {};
  if (!audioContext) return loadedBuffers;

  const loadPromises = Object.entries(paths).map(([key, url]) => {
    return (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          loadedBuffers[key] = null;
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        // Cross-browser decodeAudioData promise / callback wrapper
        const audioBuffer = await new Promise((resolve, reject) => {
          audioContext.decodeAudioData(arrayBuffer, resolve, reject);
        });
        loadedBuffers[key] = audioBuffer;
      } catch (e) {
        // Set to null on 404/network/decode error for Web Audio API synthesis fallback
        loadedBuffers[key] = null;
      }
    })();
  });

  await Promise.all(loadPromises);
  return loadedBuffers;
}

