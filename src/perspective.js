/**
 * Unified 3D Perspective Projection System for Doodle Runner
 * Maps 3D world coordinates (posX or laneIndex, worldY, z) to 2D canvas screen space.
 */

/**
 * Projects a 3D world position (posX, worldY, z) into 2D canvas coordinates.
 * @param {number} width - Canvas width (e.g. 360)
 * @param {number} height - Canvas height (e.g. 640)
 * @param {number} horizonY - Horizon Y coordinate (e.g. height * 1/6)
 * @param {number} posX - X coordinate at bottom plane (z = 1.0)
 * @param {number} worldY - Elevation height above ground (0 for ground)
 * @param {number} z - World depth along track (0.0 at horizon, 1.0 at screen bottom)
 * @returns {{ x: number, y: number, zScale: number }}
 */
export function projectPosition(width, height, horizonY, posX, worldY = 0, z = 1.0) {
  const vanishingX = width / 2;
  const x = vanishingX + (posX - vanishingX) * z;
  const y = horizonY + (height - horizonY) * z - worldY * z;
  const zScale = z;

  return { x, y, zScale };
}

/**
 * Projects a 3D lane coordinate (laneIndex, worldY, z) into 2D canvas coordinates.
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} horizonY - Horizon Y coordinate
 * @param {number} laneIndex - Lane index (0 = Left, 1 = Middle, 2 = Right)
 * @param {number} worldY - Elevation height above ground
 * @param {number} z - World depth along track
 * @returns {{ x: number, y: number, zScale: number, laneCenterX: number }}
 */
export function projectLane(width, height, horizonY, laneIndex, worldY = 0, z = 1.0) {
  const laneWidth = width / 3;
  const posX = laneWidth * laneIndex + laneWidth / 2;
  const projection = projectPosition(width, height, horizonY, posX, worldY, z);
  return {
    ...projection,
    laneCenterX: posX
  };
}
