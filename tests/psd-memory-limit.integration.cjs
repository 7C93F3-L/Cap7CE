const assert = require('node:assert/strict');
const { initializeCanvas, writePsdBuffer, readPsd } = require('ag-psd');
const { createCanvas, ImageData } = require('@napi-rs/canvas');
initializeCanvas(createCanvas, (width, height) => new ImageData(width, height));
// Small valid layer with a deliberately smaller decoding budget.
// This checks the advisory's limit propagation without allocating a hostile-size buffer.
const input = writePsdBuffer({ width: 1, height: 1, children: [
  { name: 'bounded-layer', imageData: { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) } }
] });
assert.throws(() => readPsd(input, { useImageData: true, skipCompositeImageData: true, totalMemoryLimit: 128 }), /Exceeded memory limit/);
const metadata = readPsd(input, { skipLayerImageData: true, skipCompositeImageData: true, totalMemoryLimit: 128 });
assert.equal(metadata.children.length, 1);
assert.equal(metadata.children[0].imageData, undefined);
console.log('PSD layer allocation respects totalMemoryLimit; metadata-only parsing skips layer pixels. Small in-memory fixture only.');
