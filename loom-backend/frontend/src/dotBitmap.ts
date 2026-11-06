export function encodeDotBmp(dots: Uint8Array, width: number, height: number): ArrayBuffer {
  // BMP scanlines are bottom-up and padded to four bytes.
  const stride = Math.ceil(width / 4) * 4;
  const pixelOffset = 14 + 40 + 256 * 4;
  const buffer = new ArrayBuffer(pixelOffset + stride * height);
  const header = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x42, 0x4d]);
  header.setUint32(2, buffer.byteLength, true);
  header.setUint32(10, pixelOffset, true);
  header.setUint32(14, 40, true);
  header.setInt32(18, width, true);
  header.setInt32(22, height, true);
  header.setUint16(26, 1, true);
  header.setUint16(28, 8, true);
  header.setUint32(34, stride * height, true);
  header.setUint32(46, 256, true);
  bytes.set([255, 255, 255], 54 + 4);
  for (let y = 0; y < height; y++) {
    bytes.set(dots.subarray(y * width, (y + 1) * width), pixelOffset + (height - 1 - y) * stride);
  }
  return buffer;
}

export function fillDots(dots: Uint8Array, width: number, start: number, value: number) {
  const previous = dots[start];
  if (previous === value) return;
  const stack = [start];
  dots[start] = value;
  const visit = (index: number) => {
    if (dots[index] === previous) {
      dots[index] = value;
      stack.push(index);
    }
  };
  while (stack.length) {
    const index = stack.pop()!;
    if (index % width !== 0) visit(index - 1);
    if (index % width !== width - 1) visit(index + 1);
    visit(index - width);
    visit(index + width);
  }
}

const projectMagic = 0x534a4431; // SJD1
export const maxProjectDots = 8_000_000;
const projectHeaderBytes = 12;

export function encodeDotProject(dots: Uint8Array, width: number, height: number): ArrayBuffer {
  const buffer = new ArrayBuffer(projectHeaderBytes + dots.length);
  const header = new DataView(buffer);
  header.setUint32(0, projectMagic);
  header.setUint32(4, width);
  header.setUint32(8, height);
  new Uint8Array(buffer, projectHeaderBytes).set(dots);
  return buffer;
}

export function decodeDotProject(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  if (buffer.byteLength < projectHeaderBytes || header.getUint32(0) !== projectMagic) {
    throw new Error('Choose a valid .sjd project saved by Dot Studio.');
  }
  const width = header.getUint32(4);
  const height = header.getUint32(8);
  const count = width * height;
  if (!width || !height || width > 16_384 || height > 16_384 ||
      count > maxProjectDots || buffer.byteLength !== projectHeaderBytes + count) {
    throw new Error('This project has invalid or unsupported dimensions.');
  }
  const dots = new Uint8Array(buffer, projectHeaderBytes);
  if (dots.some(dot => dot > 1)) throw new Error('The project contains invalid dot values.');
  return { width, height, dots };
}
