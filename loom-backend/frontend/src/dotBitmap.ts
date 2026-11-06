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

// Windows BMP with an uncompressed, black-and-white indexed palette.
export function decodeDotBmp(buffer: ArrayBuffer) {
  const header = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 54 || header.getUint16(0) !== 0x424d) {
    throw new Error('Choose a valid Windows BMP design.');
  }
  const dibSize = header.getUint32(14, true);
  const width = header.getInt32(18, true);
  const signedHeight = header.getInt32(22, true);
  const height = Math.abs(signedHeight);
  const depth = header.getUint16(28, true);
  if (dibSize < 40 || header.getUint16(26, true) !== 1 ||
      (depth !== 1 && depth !== 8) || header.getUint32(30, true) !== 0) {
    throw new Error('Use an uncompressed 1-bit or 8-bit indexed black-and-white BMP.');
  }
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384 || width * height > maxProjectDots) {
    throw new Error('The BMP exceeds the Dot Studio size limits or has invalid dimensions.');
  }

  const paletteStart = 14 + dibSize;
  const paletteSize = header.getUint32(46, true) || 2 ** depth;
  const pixelStart = header.getUint32(10, true);
  const stride = Math.ceil(width * depth / 32) * 4;
  if (paletteSize > 2 ** depth || paletteStart + paletteSize * 4 > pixelStart ||
      pixelStart + stride * height > bytes.length) {
    throw new Error('The BMP palette or pixel data is incomplete.');
  }

  const palette = new Int8Array(paletteSize).fill(-1);
  for (let index = 0; index < paletteSize; index++) {
    const offset = paletteStart + index * 4;
    const value = bytes[offset];
    if ((value === 0 || value === 255) && bytes[offset + 1] === value && bytes[offset + 2] === value) {
      palette[index] = value / 255;
    }
  }
  const dots = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = pixelStart + (signedHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const index = depth === 8 ? bytes[row + x] : (bytes[row + (x >> 3)] >> (7 - (x & 7))) & 1;
      const dot = palette[index];
      if (dot !== 0 && dot !== 1) {
        throw new Error('This BMP uses pixels outside the black-and-white palette.');
      }
      dots[y * width + x] = dot;
    }
  }
  return { width, height, dots };
}
