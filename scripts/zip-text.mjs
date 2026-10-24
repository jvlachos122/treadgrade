import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import readline from "node:readline";
import { createInflateRaw } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * Stream the first .txt member of a ZIP as lines.
 * Supports stored and deflated entries. Sizes come from the central directory,
 * so a data-descriptor flag on the local header is fine. ZIP64 is refused.
 */
export async function openZipTextLines(zipPath) {
  const handle = await open(zipPath, "r");
  try {
    const stat = await handle.stat();
    const tailLen = Math.min(stat.size, 66000);
    const tail = Buffer.alloc(tailLen);
    await handle.read(tail, 0, tailLen, stat.size - tailLen);
    const eocd = lastIndexOfUInt32(tail, EOCD);
    if (eocd < 0) throw new Error("ZIP directory not found");
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new Error("ZIP64 is not supported");
    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);
    const entry = findTextEntry(cd);
    const local = Buffer.alloc(30);
    await handle.read(local, 0, 30, entry.localOffset);
    if (local.readUInt32LE(0) !== LOCAL) throw new Error("Bad ZIP local header");
    const dataStart = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const fileStream = createReadStream(zipPath, { start: dataStart, end: dataStart + entry.compSize - 1 });
    const input = entry.method === 0 ? fileStream : fileStream.pipe(createInflateRaw());
    return readline.createInterface({ input, crlfDelay: Infinity });
  } finally {
    await handle.close();
  }
}

function findTextEntry(cd) {
  let offset = 0;
  let found = null;
  while (offset + 46 <= cd.length) {
    if (cd.readUInt32LE(offset) !== CENTRAL) break;
    const method = cd.readUInt16LE(offset + 10);
    const compSize = cd.readUInt32LE(offset + 20);
    const uncompSize = cd.readUInt32LE(offset + 24);
    const nameLen = cd.readUInt16LE(offset + 28);
    const extraLen = cd.readUInt16LE(offset + 30);
    const commentLen = cd.readUInt16LE(offset + 32);
    const localOffset = cd.readUInt32LE(offset + 42);
    const name = cd.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    if (!found && name.toLowerCase().endsWith(".txt")) {
      if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP method ${method} for ${name}`);
      if (!compSize || compSize === 0xffffffff || uncompSize === 0xffffffff) throw new Error(`Bad ZIP size for ${name}`);
      if (uncompSize > 800_000_000) throw new Error(`ZIP member ${name} is unexpectedly large`);
      found = { method, compSize, localOffset, name };
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (!found) throw new Error("ZIP has no text file");
  return found;
}

function lastIndexOfUInt32(buffer, value) {
  for (let index = buffer.length - 4; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === value) return index;
  }
  return -1;
}
