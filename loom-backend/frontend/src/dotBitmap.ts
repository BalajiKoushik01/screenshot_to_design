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
