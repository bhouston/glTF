// Copyright 2026 The Khronos Group Inc.
// SPDX-License-Identifier: Apache-2.0
import { deflateSync } from 'node:zlib';
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pixelPNG(rgb = [255, 255, 255]) {
  function chunk(type, content) { const data = Buffer.concat([Buffer.from(type), content]), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(content.length); checksum.writeUInt32BE(crc32(data)); return Buffer.concat([size, data, checksum]); }
  const header = Buffer.alloc(13); header.writeUInt32BE(1,0); header.writeUInt32BE(1,4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',deflateSync(Buffer.from([0,...rgb]))), chunk('IEND',Buffer.alloc(0))]);
}
