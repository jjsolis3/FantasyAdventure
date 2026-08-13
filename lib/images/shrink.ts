/**
 * Making a phone photograph small enough to keep, in the browser.
 *
 * The shrinking happens on the device rather than the server, and that is not
 * an optimisation. A phone photograph of a felt-tip drawing is four megabytes
 * of kitchen table; sending that up, storing it, and then sending it back down
 * to every other player on every page — to show a picture two centimetres
 * across — would be absurd. The browser already has the decoder and a canvas.
 *
 * Two shapes, because pictures in this game are used two ways. A face appears
 * in a circle or a square, so it is centre-cropped square and letterboxing would
 * look like a mistake. A place or a chapter appears across the top of a
 * television, so it is cropped wide and squaring it would cut the room in half.
 */

export type Shape = "square" | "wide";

const SIDES: Record<Shape, { width: number; height: number }> = {
  // Enough for a face on a phone, and for the same face on a television at the
  // size the party strip shows it.
  square: { width: 512, height: 512 },
  // 16:9, because the thing displaying it at its largest is a widescreen TV.
  wide: { width: 1024, height: 576 },
};

/**
 * Centre-crops to the shape and scales down, as a JPEG.
 *
 * Centre, because the subject of a picture somebody deliberately chose is,
 * essentially always, in the middle of it.
 */
export async function shrinkToShape(file: File, shape: Shape): Promise<Blob> {
  const target = SIDES[shape];
  const bitmap = await createImageBitmap(file);

  // The largest rectangle of the target's proportions that fits in the source.
  const wanted = target.width / target.height;
  const actual = bitmap.width / bitmap.height;

  const cropWidth = actual > wanted ? bitmap.height * wanted : bitmap.width;
  const cropHeight = actual > wanted ? bitmap.height : bitmap.width / wanted;
  const left = (bitmap.width - cropWidth) / 2;
  const top = (bitmap.height - cropHeight) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(
    bitmap,
    left,
    top,
    cropWidth,
    cropHeight,
    0,
    0,
    target.width,
    target.height,
  );
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("could not encode"))),
      "image/jpeg",
      0.85,
    );
  });
}
