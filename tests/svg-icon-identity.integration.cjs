const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { namespaceSvgIds } = require("../src/renderer/components/svgIdNamespace.ts");
const fixture = `<svg id="icon" aria-labelledby="title external"><defs><linearGradient id='gradient'><stop stop-color="#abc"/></linearGradient><clipPath id="clip"/></defs><title id="title">Same title</title><path style="fill:url(#gradient);clip-path:url( '#clip' )"/><use href="#icon"/><use xlink:href='#clip'/><image href="other.svg#gradient"/></svg>`;
const first = namespaceSvgIds(fixture, "first"), second = namespaceSvgIds(fixture, "second");
assert.match(first, /id="first-icon"/);
assert.match(first, /id='first-gradient'/);
assert.match(first, /url\(#first-gradient\)/);
assert.match(first, /url\('#first-clip'\)/);
assert.match(first, /href="#first-icon"/);
assert.match(first, /xlink:href='#first-clip'/);
assert.match(first, /aria-labelledby="first-title external"/);
assert.match(first, /stop-color="#abc"/);
assert.match(first, /href="other.svg#gradient"/);
assert.match(second, /url\(#second-gradient\)/);
assert.equal(namespaceSvgIds('<svg><path fill="#abc"/></svg>', "plain"), '<svg><path fill="#abc"/></svg>');
assert.throws(() => namespaceSvgIds(fixture, "bad prefix"), /invalid-svg-prefix/);
const ids = text => [...text.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
for (const name of fs.readdirSync(path.join(__dirname, "../resources/icons"))) {
  if (!name.endsWith(".svg")) continue;
  const source = fs.readFileSync(path.join(__dirname, "../resources/icons", name), "utf8");
  const firstIds = new Set(ids(namespaceSvgIds(source, "first")));
  for (const id of ids(namespaceSvgIds(source, "second"))) assert(!firstIds.has(id), `${name} retained a shared SVG identity`);
}
console.log("SVG instances keep independent gradient, clip, href and accessible-title identities.");
