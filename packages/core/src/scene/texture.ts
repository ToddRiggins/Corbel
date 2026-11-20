/**
 * Godot 4 Texture2D. Holds a decoded bitmap; backends upload it to the GPU
 * and bind it as a material's albedo texture.
 */

/** The default decoder is the browser's <img> element (png, jpg, gif, webp…). */
function default_decoder(source: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Texture decode failed."));
  image.src = source;
  return promise;
}

export class Texture2D {
  /** The decoded source the backends upload (an <img> element by default). */
  readonly image: HTMLImageElement;
  /** How much texture-sample reads scale the color; Godot's texture filter. */
  readonly width: number;
  readonly height: number;

  constructor(image: HTMLImageElement) {
    this.image = image;
    this.width = image.naturalWidth || image.width;
    this.height = image.naturalHeight || image.height;
  }

  /**
   * Decodes a data URL (png, jpg, gif, webp) into a Texture2D. The decoder
   * is injectable so headless tests can substitute a stub element.
   */
  static from_base64(data_url: string, decoder = default_decoder): Promise<Texture2D> {
    return decoder(data_url).then((image) => new Texture2D(image));
  }
}
