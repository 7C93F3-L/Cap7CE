const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const geometry = require("../dist-electron/windowLayoutGeometry.js");
const { getDefaultShellLayoutBounds } = require("../dist-electron/windowLayoutManager.js");
const {
  WindowLayoutStore,
  normalizeWindowLayoutDocument,
  readWindowLayoutDocument,
  writeWindowLayoutDocument
} = require("../dist-electron/windowLayoutStore.js");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const savedProfile = {
  expandedBounds: { x: 100, y: 120, width: 900, height: 600 },
  displayId: 7,
  displayBoundsSnapshot: { x: 0, y: 0, width: 1920, height: 1080 },
  workAreaSnapshot: workArea,
  scaleFactor: 1,
  dockEdge: null,
  updatedAt: "2026-08-24T00:00:00.000Z"
};

assert.deepEqual(
  geometry.clampWindowLayoutBounds({ x: -50, y: 980, width: 500, height: 300 }, workArea, { width: 300, height: 156 }),
  { x: 0, y: 740, width: 500, height: 300 }
);
assert.deepEqual(
  geometry.clampWindowLayoutBounds({ x: 100, y: 100, width: 900, height: 500 }, workArea, { width: 300, height: 156 }, { width: 520 }),
  { x: 100, y: 100, width: 520, height: 500 }
);
assert.equal(geometry.detectWindowDockEdge({ x: 5, y: 5, width: 500, height: 300 }, workArea, 12, "top"), "top");
assert.equal(geometry.detectWindowDockEdge({ x: 5, y: 5, width: 500, height: 300 }, workArea, 12, "left"), "left");
assert.equal(geometry.detectWindowDockEdge({ x: 200, y: 200, width: 500, height: 300 }, workArea, 12), null);
assert.equal(geometry.inferTaskbarEdge({ x: 0, y: 0, width: 1920, height: 1080 }, workArea), "bottom");
assert.equal(
  geometry.inferTaskbarEdge({ x: 0, y: 0, width: 1920, height: 1080 }, { x: 48, y: 0, width: 1872, height: 1080 }),
  "left"
);
assert.equal(
  geometry.isWindowDockEdgeExposed(
    { x: 1380, y: 200, width: 540, height: 156 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    [{ x: 1920, y: 0, width: 1920, height: 1080 }],
    "right"
  ),
  false
);
assert.equal(
  geometry.isWindowDockEdgeExposed(
    { x: 1380, y: 200, width: 540, height: 156 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    [{ x: 1920, y: 700, width: 1920, height: 1080 }],
    "right"
  ),
  true
);
assert.equal(
  geometry.isWindowDockEdgeExposed(
    { x: 500, y: 0, width: 540, height: 156 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    [{ x: 1920, y: 0, width: 1920, height: 1080 }],
    "top"
  ),
  true
);

assert.deepEqual(
  geometry.getEdgeAnchoredCapsuleBounds(workArea, { width: 300, height: 34 }, "bottom", 5),
  { x: 810, y: 1001, width: 300, height: 34 }
);
assert.deepEqual(
  getDefaultShellLayoutBounds("capsule", workArea, { capsuleWidth: 300, capsuleHeight: 34, microHeight: 156, miniHeight: 600, edgeGap: 5 }),
  { x: 810, y: 1001, width: 300, height: 34 }
);
assert.deepEqual(
  geometry.getEdgeAnchoredCapsuleBounds({ x: -1600, y: 40, width: 1600, height: 860 }, { width: 300, height: 34 }, "top", 5),
  { x: -950, y: 45, width: 300, height: 34 }
);
assert.deepEqual(
  geometry.getDirectionalLineBounds(workArea, "right", 180, 15, 5),
  { x: 1900, y: 430, width: 15, height: 180 }
);
assert.deepEqual(
  geometry.getDirectionalLineShape({ x: 0, y: 0, width: 39, height: 180 }, "right", 15),
  { x: 24, y: 0, width: 15, height: 180 }
);
assert.deepEqual(
  geometry.getDirectionalLineShape({ x: 0, y: 0, width: 180, height: 39 }, "top", 15),
  { x: 0, y: 0, width: 180, height: 15 }
);
const rightDockedProfile = {
  ...savedProfile,
  expandedBounds: { x: 1015, y: 220, width: 900, height: 600 },
  dockEdge: "right"
};
assert.deepEqual(
  geometry.resolveRememberedWindowBounds({
    defaultBounds: { x: 690, y: 270, width: 540, height: 156 },
    profile: rightDockedProfile,
    targetWorkArea: workArea,
    rememberLayout: true,
    minimumSize: { width: 300, height: 156 },
    fixedHeight: 156
  }),
  { x: 1015, y: 442, width: 900, height: 156 }
);
assert.deepEqual(
  geometry.resolveRememberedWindowBounds({
    defaultBounds: { x: 320, y: 140, width: 1280, height: 760 },
    profile: savedProfile,
    targetWorkArea: workArea,
    rememberLayout: true,
    minimumSize: { width: 300, height: 156 }
  }),
  { x: 100, y: 120, width: 900, height: 600 }
);

const displays = [
  { id: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
  { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea, scaleFactor: 1 }
];
assert.equal(geometry.selectWindowLayoutDisplay(displays, savedProfile).id, 7);
assert.equal(geometry.selectWindowLayoutDisplay(displays, { ...savedProfile, displayId: 99 }).id, 7);

const runStoreChecks = async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-window-layout-"));
  try {
  const filePath = path.join(temporaryRoot, "config", "window-layout.json");
  assert.deepEqual(await readWindowLayoutDocument(filePath), {
    version: 1,
    lastDockEdge: null,
    lastDockDisplayId: null,
    profiles: {}
  });

  const document = {
    version: 1,
    lastDockEdge: "right",
    lastDockDisplayId: 7,
    profiles: { normal: savedProfile }
  };
  await writeWindowLayoutDocument(filePath, document);
  assert.deepEqual(await readWindowLayoutDocument(filePath), document);
  await assert.rejects(fs.access(`${filePath}.tmp`));

  const normalized = normalizeWindowLayoutDocument({
    ...document,
    profiles: { normal: savedProfile, mini: { expandedBounds: { width: -1 } } }
  });
  assert.deepEqual(Object.keys(normalized.profiles), ["normal"]);

  const store = new WindowLayoutStore(filePath, 5);
  store.schedule({ ...document, lastDockEdge: "left" });
  store.schedule({ ...document, lastDockEdge: "top" });
  await store.flush();
  assert.equal((await store.load()).lastDockEdge, "top");

  await fs.writeFile(filePath, "{not-json", "utf8");
  assert.deepEqual(await readWindowLayoutDocument(filePath), {
    version: 1,
    lastDockEdge: null,
    lastDockDisplayId: null,
    profiles: {}
  });
  const backups = (await fs.readdir(path.dirname(filePath))).filter((name) => name.startsWith("window-layout.json.corrupt-"));
  assert.equal(backups.length, 1);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    boundsClampVerified: true,
    edgeAndTaskbarDetectionVerified: true,
    capsuleAndLineGeometryVerified: true,
    completeLayoutRestoreVerified: true,
    multiDisplayFallbackVerified: true,
    versionedAtomicStoreVerified: true,
    corruptStoreRecoveryVerified: true,
    debouncedLastWriteWinsVerified: true
  }));
};

void runStoreChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
