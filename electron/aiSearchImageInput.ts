import sharp from "sharp";

const maximumEdge = 300;

export const prepareAiSearchImageDataUrl = async (thumbnailPath: string) => {
  const jpeg = await sharp(thumbnailPath)
    .resize(maximumEdge, maximumEdge, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
};
