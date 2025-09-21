import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

// Minimal PNG-to-ICO packer (combines 16/32/48 pngs into favicon.ico)
// Note: This is a simple packer for uncompressed PNG entries in ICO.

function writeIconDirEntry(stream, width, height, size, offset) {
  stream.write(Buffer.from([
    width === 256 ? 0 : width, // 0 means 256 in ICO format
    height === 256 ? 0 : height,
    0, // color count
    0, // reserved
    1, 0, // color planes
    32, 0, // bpp
  ]));
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32LE(size, 0);
  stream.write(sizeBuf);
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(offset, 0);
  stream.write(offsetBuf);
}

async function main() {
  const base = resolve(process.cwd(), 'public/icons');
  const sizes = [16, 32, 48];
  const files = await Promise.all(
    sizes.map(async (s) => ({ s, buf: await readFile(resolve(base, s === 16 ? 'favicon-16x16.png' : s === 32 ? 'favicon-32x32.png' : 'icon-48x48.png')) }))
  );

  // Validate PNGs
  for (const f of files) {
    await new Promise((res, rej) => {
      const png = new PNG();
      png.parse(f.buf, (err) => (err ? rej(err) : res()));
    });
  }

  const outPath = resolve(process.cwd(), 'public/favicon.ico');
  const out = createWriteStream(outPath);

  // ICONDIR header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(files.length, 4); // image count
  out.write(header);

  // Compute offsets: header(6) + entries(16 * n)
  let offset = 6 + 16 * files.length;
  const entries = [];
  for (const f of files) {
    entries.push({ width: f.s, height: f.s, size: f.buf.length, offset });
    offset += f.buf.length;
  }

  // Write ICONDIRENTRY for each
  for (const e of entries) {
    writeIconDirEntry(out, e.width, e.height, e.size, e.offset);
  }

  // Write image data blobs
  for (const f of files) {
    out.write(f.buf);
  }

  out.end();
  console.log(`Generated ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
