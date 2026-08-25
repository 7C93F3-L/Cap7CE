const assert = require("node:assert/strict");
const initSqlJs = require("sql.js");

const {
  analyzeVisualProperties,
  MAXIMUM_VISUAL_PROPERTY_PIXELS,
  VISUAL_PROPERTY_ANALYZER_VERSION
} = require("../dist-electron/visualPropertyAnalyzer.js");
const {
  ensureVisualPropertySchema,
  readVisualPropertyRecord,
  replaceVisualPropertyRecord
} = require("../dist-electron/visualPropertyStore.js");

const createRgba = (width, height, pixel) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { data, width, height };
};

const redCutout = (hiddenRgb) => createRgba(10, 10, (x, y) => (
  x >= 2 && x <= 7 && y >= 2 && y <= 7
    ? [255, 0, 0, 255]
    : [hiddenRgb, hiddenRgb, hiddenRgb, 0]
));

const run = async () => {
  const transparent = analyzeVisualProperties(redCutout(0));
  assert.equal(VISUAL_PROPERTY_ANALYZER_VERSION, 1);
  assert.equal(transparent.transparentRatio, 6400);
  assert.equal(transparent.semitransparentRatio, 0);
  assert.equal(transparent.borderTransparentRatio, 10000);
  assert.equal(transparent.colorRatios.red, 10000);
  assert.equal(transparent.colorBlockRatios.red, 10000);
  assert.equal(transparent.darkRatio, 0);
  assert.equal(transparent.saturationMean, 10000);
  assert.deepEqual(
    analyzeVisualProperties(redCutout(255)),
    transparent,
    "RGB hidden under fully transparent pixels must not affect visible properties"
  );

  const whiteBackground = analyzeVisualProperties(createRgba(10, 10, (x, y) => (
    x >= 3 && x <= 6 && y >= 3 && y <= 6
      ? [0, 0, 0, 255]
      : [255, 255, 255, 255]
  )));
  assert.equal(whiteBackground.borderWhiteRatio, 10000);
  assert.equal(whiteBackground.borderBlackRatio, 0);
  assert.equal(whiteBackground.highlightRatio, 8400);
  assert.equal(whiteBackground.darkRatio, 1600);

  const semitransparent = analyzeVisualProperties(createRgba(3, 3, () => [0, 0, 255, 128]));
  assert.equal(semitransparent.transparentRatio, 0);
  assert.equal(semitransparent.semitransparentRatio, 10000);
  assert.equal(semitransparent.colorRatios.blue, 10000);
  assert.equal(semitransparent.borderTransparentRatio, 0);

  assert.throws(
    () => analyzeVisualProperties({ data: new Uint8Array(4), width: 2, height: 2 }),
    /four RGBA channels/u
  );
  assert.throws(
    () => analyzeVisualProperties({
      data: new Uint8Array((MAXIMUM_VISUAL_PROPERTY_PIXELS + 300) * 4),
      width: 301,
      height: 300
    }),
    /exceeds/u
  );

  const SQL = await initSqlJs({ locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`) });
  const database = new SQL.Database();
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE files (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL UNIQUE);
    INSERT INTO files VALUES (1, 'sample.png');
  `);
  ensureVisualPropertySchema(database);
  const columns = database.exec("PRAGMA table_info(file_visual_properties)")[0].values
    .map((column) => String(column[1]));
  assert.equal(columns.some((column) => /keyword|search_text/iu.test(column)), false);
  assert.ok(columns.includes("border_transparent_ratio"));
  assert.ok(columns.includes("red_block_ratio"));

  replaceVisualPropertyRecord(database, "sample.png", {
    sourceRevision: "100:200",
    analyzerVersion: VISUAL_PROPERTY_ANALYZER_VERSION,
    status: "indexed",
    properties: transparent,
    errorCode: "ignored"
  }, "2026-08-22T15:00:00.000Z");
  assert.deepEqual(readVisualPropertyRecord(database, "sample.png"), {
    sourceRevision: "100:200",
    analyzerVersion: 1,
    status: "indexed",
    properties: transparent,
    errorCode: "",
    indexedAt: "2026-08-22T15:00:00.000Z"
  });
  assert.throws(() => replaceVisualPropertyRecord(database, "sample.png", {
    sourceRevision: "100:201",
    analyzerVersion: 1,
    status: "indexed",
    properties: { ...transparent, transparentRatio: 10001 },
    errorCode: ""
  }, "2026-08-22T15:01:00.000Z"), /must be an integer/u);

  replaceVisualPropertyRecord(database, "sample.png", {
    sourceRevision: "100:201",
    analyzerVersion: 2,
    status: "failed",
    properties: transparent,
    errorCode: "Decoder timed out!"
  }, "2026-08-22T15:02:00.000Z");
  assert.deepEqual(readVisualPropertyRecord(database, "sample.png"), {
    sourceRevision: "100:201",
    analyzerVersion: 2,
    status: "failed",
    properties: null,
    errorCode: "decoder-timed-out",
    indexedAt: "2026-08-22T15:02:00.000Z"
  });

  database.run("DELETE FROM files WHERE file_path = 'sample.png'");
  assert.equal(readVisualPropertyRecord(database, "sample.png"), null);
  database.close();

  console.log(JSON.stringify({
    boundedRgbaAnalyzerVerified: true,
    transparentRgbIsolationVerified: true,
    fixedIntegerVectorVerified: true,
    synonymFreeStoreVerified: true,
    failureReplacementAndCascadeVerified: true
  }));
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
