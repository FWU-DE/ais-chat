function serializeSvg(svg: SVGSVGElement) {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
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

function download(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

export function downloadPng(svg: SVGSVGElement, filename: string) {
  const { markup, width, height } = serializeSvg(svg);
  // Rasterize above the on-screen CSS size so the PNG stays crisp on high-DPI displays.
  const scale = 2;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    download(canvas.toDataURL('image/png'), `${filename}.png`);
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}
