export const AI_BADGE_SIZE_PX = 56;
export const AI_BADGE_PADDING_PX = 28;

export async function bakeAiBadge(sourceUrl: string, badgeSrc: string): Promise<Blob> {
  const [sourceImage, badgeImage] = await Promise.all([loadImage(sourceUrl), loadImage(badgeSrc)]);

  const canvas = document.createElement('canvas');
  canvas.width = sourceImage.naturalWidth;
  canvas.height = sourceImage.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(sourceImage, 0, 0);
  ctx.drawImage(
    badgeImage,
    canvas.width - AI_BADGE_SIZE_PX - AI_BADGE_PADDING_PX,
    canvas.height - AI_BADGE_SIZE_PX - AI_BADGE_PADDING_PX,
    AI_BADGE_SIZE_PX,
    AI_BADGE_SIZE_PX,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob !== null) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create image blob'));
      }
    }, 'image/png');
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
