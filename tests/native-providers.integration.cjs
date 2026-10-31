const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate'), session = require('./support/native-session.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-native-providers-')); let client;
  try {
    const runtime = path.join(root, 'runtime'), profile = path.join(root, 'profile'); await fs.mkdir(profile);
    await fs.cp(path.resolve('artifacts/metadata-worker/v1'), runtime, { recursive: true });
    client = session(runtime, 'provider-preview.cjs', profile);
    const archive = path.join(root, 'archive.zip'), book = path.join(root, 'book.epub'), text = path.join(root, 'unicode.txt');
    await fs.writeFile(archive, zipSync({ '目录/图.txt': strToU8('fixture') }));
    await fs.writeFile(book, zipSync({ mimetype: strToU8('application/epub+zip'), 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
      'content.opf': strToU8('<package><metadata><title>测试书</title></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),
      'chapter.xhtml': strToU8('<html><body><h1>标题</h1><p>正文</p></body></html>') }));
    await fs.writeFile(text, '你好\nUnicode fixture');
    const original = await fs.readFile(archive);
    const listing = await client.request('archive.open', ['archive', archive]); assert(listing.entries.some(entry => entry.path.includes('图.txt')));
    const epub = await client.request('epub.open', ['book', book]); assert.equal(epub.title, '测试书'); assert.equal(epub.chapters.length, 1);
    const content = await client.request('text.read', ['11111111-1111-4111-8111-111111111111', text]); assert.equal(content.ok, true); assert.equal(content.value.content, '你好\nUnicode fixture');
    await assert.rejects(client.request('epub.open', ['invalid', 'relative.epub']), /invalid/);
    await client.request('releaseSourceHandles', []); await client.close(); client = undefined;
    assert.deepEqual(await fs.readFile(archive), original);
    console.log('Native provider RPC: copied runtime/empty PATH, ZIP/EPUB/Unicode text, request validation, release/EOF and unchanged archive passed.');
  } finally { if (client) await client.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
