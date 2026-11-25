/**
 * lib/fitInBox.ts
 *
 * The size an image of the given pixel size takes when it is shrunk (or grown) to fit INSIDE a box without changing its shape. Used where an image must never be
 * stretched or squished whatever its own proportions are (the rank shields on the onboarding rank wheel: five are square, the Champion one is taller than wide).
 */
export function fitInBox(imgW: number, imgH: number, boxW: number, boxH: number): { width: number; height: number } {
  const w = imgW > 0 ? imgW : 1, h = imgH > 0 ? imgH : 1;
  const k = Math.min(boxW / w, boxH / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
