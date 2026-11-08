"use strict";
const fs = require("node:fs");
const { Buffer } = require("node:buffer");
const upstream = require("joyride-image-size-upstream");
const decode = upstream.imageSize || upstream.default;
const MAX_HEADER_BYTES = 512 * 1024;

function readHeader(filename) {
  const descriptor = fs.openSync(filename, "r");
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new TypeError("Expected a regular image file");
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_HEADER_BYTES));
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(
        descriptor, buffer, offset, buffer.length - offset, offset
      );
      if (count === 0) break;
      offset += count;
    }
    return buffer.subarray(0, offset);
  } finally {
    fs.closeSync(descriptor);
  }
}

function imageSize(input) {
  if (arguments.length !== 1) {
    throw new TypeError("This compatibility bridge supports synchronous calls only");
  }
  return decode(typeof input === "string" ? readHeader(input) : input);
}

module.exports = Object.assign(imageSize, upstream, {
  default: imageSize,
  imageSize
});
Object.defineProperty(module.exports, "__esModule", {value: true});
