import type { Database } from "sql.js";
import {
  VISUAL_PROPERTY_RATIO_SCALE,
  visualColorFamilies,
  type StoredVisualPropertyRecord,
  type VisualColorRatioMap,
  type VisualPropertyIndexRecord,
  type VisualPropertyVector
} from "./visualPropertyTypes";

const scalarColumns = [
  "transparent_ratio",
  "semitransparent_ratio",
  "border_transparent_ratio",
  "brightness_mean",
  "brightness_median",
  "dark_ratio",
  "highlight_ratio",
  "saturation_mean",
  "high_saturation_ratio",
  "low_saturation_ratio",
  "border_white_ratio",
  "border_black_ratio",
  "border_uniformity"
] as const;

const colorColumns = visualColorFamilies.flatMap((family) => [
  `${family}_ratio`,
  `${family}_block_ratio`
]);
export const visualPropertyDatabaseColumns = [...scalarColumns, ...colorColumns];
const propertyColumns = visualPropertyDatabaseColumns;
const ratioColumnSql = propertyColumns.map((column) => (
  `${column} INTEGER CHECK (${column} BETWEEN 0 AND ${VISUAL_PROPERTY_RATIO_SCALE})`
)).join(",\n      ");

const normalizeErrorCode = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 64);
};

const assertRatio = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > VISUAL_PROPERTY_RATIO_SCALE) {
    throw new Error(`Visual property ${name} must be an integer from 0 to ${VISUAL_PROPERTY_RATIO_SCALE}.`);
  }
  return value;
};

const flattenProperties = (properties: VisualPropertyVector) => {
  const values: Record<string, number> = {
    transparent_ratio: properties.transparentRatio,
    semitransparent_ratio: properties.semitransparentRatio,
    border_transparent_ratio: properties.borderTransparentRatio,
    brightness_mean: properties.brightnessMean,
    brightness_median: properties.brightnessMedian,
    dark_ratio: properties.darkRatio,
    highlight_ratio: properties.highlightRatio,
    saturation_mean: properties.saturationMean,
    high_saturation_ratio: properties.highSaturationRatio,
    low_saturation_ratio: properties.lowSaturationRatio,
    border_white_ratio: properties.borderWhiteRatio,
    border_black_ratio: properties.borderBlackRatio,
    border_uniformity: properties.borderUniformity
  };
  for (const family of visualColorFamilies) {
    values[`${family}_ratio`] = properties.colorRatios[family];
    values[`${family}_block_ratio`] = properties.colorBlockRatios[family];
  }
  for (const column of propertyColumns) assertRatio(values[column], column);
  return values;
};

const createColorMap = (row: unknown[], startIndex: number, block: boolean): VisualColorRatioMap => {
  const values = {} as VisualColorRatioMap;
  for (let index = 0; index < visualColorFamilies.length; index += 1) {
    values[visualColorFamilies[index]] = Number(row[startIndex + index * 2 + (block ? 1 : 0)] ?? 0);
  }
  return values;
};

export const inflateVisualPropertyValues = (row: unknown[], startIndex: number): VisualPropertyVector => {
  const scalar = scalarColumns.map((_, index) => Number(row[startIndex + index] ?? 0));
  const colorStart = startIndex + scalarColumns.length;
  return {
    transparentRatio: scalar[0],
    semitransparentRatio: scalar[1],
    borderTransparentRatio: scalar[2],
    brightnessMean: scalar[3],
    brightnessMedian: scalar[4],
    darkRatio: scalar[5],
    highlightRatio: scalar[6],
    saturationMean: scalar[7],
    highSaturationRatio: scalar[8],
    lowSaturationRatio: scalar[9],
    borderWhiteRatio: scalar[10],
    borderBlackRatio: scalar[11],
    borderUniformity: scalar[12],
    colorRatios: createColorMap(row, colorStart, false),
    colorBlockRatios: createColorMap(row, colorStart, true)
  };
};

export const ensureVisualPropertySchema = (database: Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS file_visual_properties (
      file_id INTEGER PRIMARY KEY,
      source_revision TEXT NOT NULL,
      analyzer_version INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
      error_code TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL,
      ${ratioColumnSql},
      FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_file_visual_properties_version
      ON file_visual_properties (analyzer_version, status);
  `);
};

export const readVisualPropertyRecord = (
  database: Database,
  filePath: string
): StoredVisualPropertyRecord | null => {
  const row = database.exec(`
    SELECT property.source_revision, property.analyzer_version, property.status,
           property.error_code, property.indexed_at,
           ${propertyColumns.map((column) => `property.${column}`).join(", ")}
    FROM file_visual_properties AS property
    INNER JOIN files AS file ON file.id = property.file_id
    WHERE file.file_path = :file_path COLLATE NOCASE
    LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0];
  if (!row) return null;
  const status = String(row[2]) as StoredVisualPropertyRecord["status"];
  return {
    sourceRevision: String(row[0]),
    analyzerVersion: Number(row[1]),
    status,
    errorCode: String(row[3] ?? ""),
    indexedAt: String(row[4]),
    properties: status === "indexed" ? inflateVisualPropertyValues(row, 5) : null
  };
};

export const replaceVisualPropertyRecord = (
  database: Database,
  filePath: string,
  record: VisualPropertyIndexRecord,
  indexedAt: string
) => {
  const fileId = Number(database.exec(`
    SELECT id FROM files WHERE file_path = :file_path COLLATE NOCASE LIMIT 1
  `, { ":file_path": filePath })[0]?.values[0]?.[0]);
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error("Visual properties require an indexed file.");
  }
  if (!Number.isSafeInteger(record.analyzerVersion) || record.analyzerVersion <= 0) {
    throw new Error("Visual property analyzer version is invalid.");
  }
  if (record.status === "indexed" && !record.properties) {
    throw new Error("Indexed visual properties require a property vector.");
  }
  const values = record.status === "indexed" && record.properties
    ? flattenProperties(record.properties)
    : null;
  const columns = propertyColumns.join(", ");
  const parameters = propertyColumns.map((column) => `:${column}`).join(", ");
  const updates = propertyColumns.map((column) => `${column} = excluded.${column}`).join(", ");
  database.run(`
    INSERT INTO file_visual_properties (
      file_id, source_revision, analyzer_version, status, error_code, indexed_at, ${columns}
    ) VALUES (
      :file_id, :source_revision, :analyzer_version, :status, :error_code, :indexed_at, ${parameters}
    )
    ON CONFLICT(file_id) DO UPDATE SET
      source_revision = excluded.source_revision,
      analyzer_version = excluded.analyzer_version,
      status = excluded.status,
      error_code = excluded.error_code,
      indexed_at = excluded.indexed_at,
      ${updates}
  `, {
    ":file_id": fileId,
    ":source_revision": record.sourceRevision,
    ":analyzer_version": record.analyzerVersion,
    ":status": record.status,
    ":error_code": record.status === "failed" ? normalizeErrorCode(record.errorCode) || "unknown" : "",
    ":indexed_at": indexedAt,
    ...Object.fromEntries(propertyColumns.map((column) => [`:${column}`, values?.[column] ?? null]))
  });
};
