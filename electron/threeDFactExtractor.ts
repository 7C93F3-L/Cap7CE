import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const maximumJsonBytes = 64 * 1024 * 1024;
const glbMagic = 0x46546c67;
const glbJsonChunkType = 0x4e4f534a;

interface ThreeDSourceFact {
  triangleCountKnown: boolean;
  triangleCount: number;
  animationKnown: boolean;
  hasAnimation: boolean;
  rigKnown: boolean;
  hasRig: boolean;
}

const safeCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;

const primitiveTriangleCount = (document: Record<string, unknown>) => {
  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  let total = 0;
  for (const meshValue of meshes) {
    if (!meshValue || typeof meshValue !== "object") continue;
    const primitives = Array.isArray((meshValue as Record<string, unknown>).primitives)
      ? (meshValue as Record<string, unknown>).primitives as unknown[]
      : [];
    for (const primitiveValue of primitives) {
      if (!primitiveValue || typeof primitiveValue !== "object") continue;
      const primitive = primitiveValue as Record<string, unknown>;
      const attributes = primitive.attributes && typeof primitive.attributes === "object"
        ? primitive.attributes as Record<string, unknown>
        : {};
      const accessorIndexValue = primitive.indices === undefined ? attributes.POSITION : primitive.indices;
      if (!Number.isSafeInteger(accessorIndexValue) || Number(accessorIndexValue) < 0) continue;
      const accessorIndex = Number(accessorIndexValue);
      const accessor = accessors[accessorIndex];
      const elementCount = accessor && typeof accessor === "object"
        ? safeCount((accessor as Record<string, unknown>).count)
        : 0;
      const mode = primitive.mode === undefined ? 4 : safeCount(primitive.mode);
      const triangles = mode === 4 ? Math.floor(elementCount / 3) : mode === 5 || mode === 6 ? Math.max(0, elementCount - 2) : 0;
      total += triangles;
      if (!Number.isSafeInteger(total)) throw new Error("three-d-triangle-count-overflow");
    }
  }
  return total;
};

const parseGltfDocument = (value: unknown): ThreeDSourceFact => {
  if (!value || typeof value !== "object") throw new Error("three-d-invalid-gltf");
  const document = value as Record<string, unknown>;
  return {
    triangleCountKnown: true,
    triangleCount: primitiveTriangleCount(document),
    animationKnown: true,
    hasAnimation: Array.isArray(document.animations) && document.animations.length > 0,
    rigKnown: true,
    hasRig: Array.isArray(document.skins) && document.skins.length > 0
  };
};

const readGltf = async (filePath: string) => {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > maximumJsonBytes) throw new Error("three-d-gltf-too-large");
  return parseGltfDocument(JSON.parse(await fs.readFile(filePath, "utf8")));
};

const readGlb = async (filePath: string) => {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(20);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < header.length || header.readUInt32LE(0) !== glbMagic || header.readUInt32LE(4) !== 2) throw new Error("three-d-invalid-glb");
    const declaredLength = header.readUInt32LE(8);
    const jsonLength = header.readUInt32LE(12);
    if (header.readUInt32LE(16) !== glbJsonChunkType || jsonLength <= 0 || jsonLength > maximumJsonBytes || 20 + jsonLength > declaredLength) throw new Error("three-d-invalid-glb-json");
    const json = Buffer.alloc(jsonLength);
    const result = await handle.read(json, 0, jsonLength, 20);
    if (result.bytesRead !== jsonLength) throw new Error("three-d-incomplete-glb-json");
    return parseGltfDocument(JSON.parse(json.toString("utf8").replace(/\u0000+$/u, "").trimEnd()));
  } finally {
    await handle.close();
  }
};

const readObj = async (filePath: string): Promise<ThreeDSourceFact> => {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let triangleCount = 0;
  try {
    for await (const line of lines) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("f ") && !trimmed.startsWith("f\t")) continue;
      const vertexCount = trimmed.slice(1).trim().split(/\s+/u).filter(Boolean).length;
      triangleCount += Math.max(0, vertexCount - 2);
      if (!Number.isSafeInteger(triangleCount)) throw new Error("three-d-triangle-count-overflow");
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return { triangleCountKnown: true, triangleCount, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false };
};

const readStl = async (filePath: string): Promise<ThreeDSourceFact> => {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    if (stat.size >= 84) {
      const header = Buffer.alloc(84);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const triangleCount = bytesRead === 84 ? header.readUInt32LE(80) : 0;
      if (84 + triangleCount * 50 === stat.size) {
        return { triangleCountKnown: true, triangleCount, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false };
      }
    }
  } finally {
    await handle.close();
  }
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let triangleCount = 0;
  try {
    for await (const line of lines) if (/^\s*facet\s+normal\b/iu.test(line)) triangleCount += 1;
  } finally {
    lines.close();
    input.destroy();
  }
  if (triangleCount === 0) throw new Error("three-d-invalid-stl");
  return { triangleCountKnown: true, triangleCount, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false };
};

export const readThreeDFact = async (filePath: string): Promise<ThreeDSourceFact> => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".gltf") return readGltf(filePath);
  if (extension === ".glb") return readGlb(filePath);
  if (extension === ".obj") return readObj(filePath);
  if (extension === ".stl") return readStl(filePath);
  throw new Error("three-d-format-unsupported");
};
