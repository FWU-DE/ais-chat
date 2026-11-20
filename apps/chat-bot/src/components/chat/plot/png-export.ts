function serializeSvg(svg: SVGSVGElement) {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('foreignObject').forEach((foreignObject) => foreignObject.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', 'white');
  clone.insertBefore(background, clone.firstChild);
  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

export async function renderPlotPng(svg: SVGSVGElement): Promise<Blob> {
  const { markup, width, height } = serializeSvg(svg);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load plot SVG'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
  // Rasterize above the on-screen CSS size so the PNG stays crisp on high-DPI displays.
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create plot canvas context');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Failed to render plot PNG')) : resolve(blob)),
      'image/png',
    );
  });
}

function download(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

export async function downloadPng(svg: SVGSVGElement, filename: string) {
  const png = await renderPlotPng(svg);
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Failed to encode plot PNG'));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode plot PNG'));
    reader.readAsDataURL(png);
  });
  download(url, `${filename}.png`);
}
