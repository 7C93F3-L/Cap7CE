const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_SIZES = Object.freeze([256, 300]);
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_FILES = 50;

const usage = `Usage:
  npm run probe:shell-thumbnail -- <file-or-directory> [options]

Options:
  -o, --output <directory>  Report directory (default: artifacts/shell-thumbnail-probe/<timestamp>)
  --timeout-ms <number>     Timeout per attempt (default: 15000)
  --max-files <number>      Maximum direct child files for directory input (default: 50)
  -h, --help                Show this help

Directory input is intentionally non-recursive. The probe runs sequentially and
stops after a timeout because Electron cannot cancel an in-flight Shell request.`;

const parsePositiveInteger = (value, optionName, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${optionName} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
};

const parseProbeArguments = (argv, cwd = process.cwd()) => {
  let inputPath = "";
  let outputDirectory = "";
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let maxFiles = DEFAULT_MAX_FILES;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      help = true;
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a directory.`);
      }
      outputDirectory = path.resolve(cwd, value);
      index += 1;
      continue;
    }
    if (argument === "--timeout-ms") {
      timeoutMs = parsePositiveInteger(argv[index + 1], argument, 100, 120_000);
      index += 1;
      continue;
    }
    if (argument === "--max-files") {
      maxFiles = parsePositiveInteger(argv[index + 1], argument, 1, 10_000);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (inputPath) {
      throw new Error("Only one file or directory input is supported per run.");
    }
    inputPath = path.resolve(cwd, argument);
  }

  if (!help && !inputPath) {
    throw new Error("A file or test directory is required.");
  }

  if (!outputDirectory) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    outputDirectory = path.join(cwd, "artifacts", "shell-thumbnail-probe", timestamp);
  }

  return { help, inputPath, outputDirectory, timeoutMs, maxFiles };
};

const collectInputFiles = async (inputPath, maxFiles) => {
  const inputStats = await fs.stat(inputPath);
  if (inputStats.isFile()) {
    return {
      inputKind: "file",
      discoveredFileCount: 1,
      selectedFileCount: 1,
      truncated: false,
      files: [inputPath]
    };
  }
  if (!inputStats.isDirectory()) {
    throw new Error("The input must be a regular file or directory.");
  }

  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(inputPath, entry.name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
  const selectedFiles = files.slice(0, maxFiles);
  return {
    inputKind: "directory",
    discoveredFileCount: files.length,
    selectedFileCount: selectedFiles.length,
    truncated: selectedFiles.length < files.length,
    files: selectedFiles
  };
};

const errorText = (error) => error instanceof Error ? error.message : String(error);

const probeThumbnailAttempt = async (createThumbnail, filePath, size, timeoutMs) => {
  const startedAt = performance.now();
  let timer;
  const thumbnailPromise = Promise.resolve().then(() => createThumbnail(filePath, {
    width: size,
    height: size
  }));
  // Promise.race only stops this probe from waiting. It does not cancel the
  // Windows Shell handler, so callers stop the run after a timeout.
  thumbnailPromise.catch(() => undefined);

  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      thumbnailPromise.then((image) => ({ image })),
      timeoutPromise
    ]);
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (outcome.timedOut) {
      return {
        status: "timeout",
        durationMs,
        isEmpty: null,
        pixelSize: null,
        error: `Timed out after ${timeoutMs} ms; the underlying Shell request may still be running.`
      };
    }

    const isEmpty = outcome.image.isEmpty();
    const pixelSize = isEmpty ? null : outcome.image.getSize();
    return {
      status: isEmpty ? "empty" : "success",
      durationMs,
      isEmpty,
      pixelSize,
      image: isEmpty ? null : outcome.image,
      error: null
    };
  } catch (error) {
    return {
      status: "error",
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      isEmpty: null,
      pixelSize: null,
      error: errorText(error)
    };
  } finally {
    clearTimeout(timer);
  }
};

const safeOutputStem = (filePath, sampleIndex) => {
  const filename = path.basename(filePath).normalize("NFKC");
  const safeName = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100) || "unnamed";
  return `${String(sampleIndex + 1).padStart(3, "0")}-${safeName}`;
};

const serializableAttempt = (attempt) => ({
  status: attempt.status,
  durationMs: attempt.durationMs ?? null,
  isEmpty: attempt.isEmpty ?? null,
  pixelSize: attempt.pixelSize ?? null,
  error: attempt.error ?? null
});

const escapeMarkdown = (value) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const formatPixelSize = (pixelSize) => pixelSize ? `${pixelSize.width}x${pixelSize.height}` : "-";
const formatAttempt = (attempt) => {
  const duration = attempt.durationMs === null ? "-" : `${attempt.durationMs} ms`;
  return `${attempt.status}; ${duration}; ${formatPixelSize(attempt.pixelSize)}`;
};

const buildMarkdownReport = (report) => {
  const rows = report.samples.flatMap((sample) => sample.sizes.map((sizeResult) => [
    escapeMarkdown(sample.path),
    escapeMarkdown(sample.extension || "(none)"),
    String(sizeResult.requestedSize),
    escapeMarkdown(formatAttempt(sizeResult.firstAttempt)),
    escapeMarkdown(formatAttempt(sizeResult.secondAttempt)),
    escapeMarkdown(sizeResult.imageFile || "-"),
    "待判断"
  ]));
  const errorLines = report.samples.flatMap((sample) => sample.sizes.flatMap((sizeResult) => [
    ["first", sizeResult.firstAttempt],
    ["second", sizeResult.secondAttempt]
  ].filter(([, attempt]) => attempt.error).map(([attemptName, attempt]) => (
    `- \`${sample.path.replace(/`/g, "\\`")}\` ${sizeResult.requestedSize}px ${attemptName}: ${attempt.error}`
  ))));
  if (report.abortedAfterTimeout) {
    errorLines.push("- The run stopped after a timeout to avoid stacking non-cancellable Shell requests.");
  } else if (errorLines.length === 0) {
    errorLines.push("- None.");
  }

  return [
    "# Shell 缩略图探针报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 输入：\`${report.inputPath.replace(/`/g, "\\`")}\``,
    `- 输入类型：${report.inputKind}`,
    `- 文件：已选择 ${report.selectedFileCount} / 共发现 ${report.discoveredFileCount}${report.truncated ? "（已由 --max-files 截断）" : ""}`,
    `- 单次超时：${report.timeoutMs} ms`,
    `- 平台：${report.environment.platform} ${report.environment.release} (${report.environment.arch})`,
    `- Electron: ${report.environment.electron}`,
    `- 是否在超时后中止：${report.abortedAfterTimeout ? "是" : "否"}`,
    "",
    "> Electron 不会说明返回的是内容缩略图、普通文件图标还是无意义占位图。请打开每张 PNG，并将“待判断”改为人工判断结果。",
    "",
    "| 路径 | 扩展名 | 请求尺寸 | 首次调用 | 二次调用 | 保存的 PNG | 人工判断 |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## 错误与超时",
    "",
    ...errorLines,
    ""
  ].join("\n");
};

const runShellThumbnailProbe = async ({
  createThumbnail,
  inputPath,
  outputDirectory,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxFiles = DEFAULT_MAX_FILES,
  sizes = DEFAULT_SIZES
}) => {
  const input = await collectInputFiles(inputPath, maxFiles);
  await fs.mkdir(outputDirectory, { recursive: true });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputPath,
    outputDirectory,
    inputKind: input.inputKind,
    discoveredFileCount: input.discoveredFileCount,
    selectedFileCount: input.selectedFileCount,
    truncated: input.truncated,
    timeoutMs,
    requestedSizes: [...sizes],
    environment: {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      electron: process.versions.electron ?? null,
      chrome: process.versions.chrome ?? null,
      node: process.versions.node
    },
    abortedAfterTimeout: false,
    samples: []
  };

  for (let sampleIndex = 0; sampleIndex < input.files.length; sampleIndex += 1) {
    const filePath = input.files[sampleIndex];
    const sample = {
      path: filePath,
      extension: path.extname(filePath).toLowerCase(),
      sizes: []
    };
    report.samples.push(sample);

    for (const size of sizes) {
      const first = await probeThumbnailAttempt(createThumbnail, filePath, size, timeoutMs);
      let second = {
        status: "skipped",
        durationMs: null,
        isEmpty: null,
        pixelSize: null,
        error: first.status === "timeout" ? "Skipped after first-attempt timeout." : null
      };
      if (first.status !== "timeout") {
        second = await probeThumbnailAttempt(createThumbnail, filePath, size, timeoutMs);
      }

      const image = first.image || second.image;
      let imageFile = null;
      let imageSha256 = null;
      if (image) {
        const png = image.toPNG();
        imageFile = `${safeOutputStem(filePath, sampleIndex)}-${size}px.png`;
        imageSha256 = crypto.createHash("sha256").update(png).digest("hex");
        await fs.writeFile(path.join(outputDirectory, imageFile), png);
      }

      sample.sizes.push({
        requestedSize: size,
        firstAttempt: serializableAttempt(first),
        secondAttempt: serializableAttempt(second),
        imageFile,
        imageSha256,
        manualAssessment: "pending"
      });

      if (first.status === "timeout" || second.status === "timeout") {
        report.abortedAfterTimeout = true;
        break;
      }
    }
    if (report.abortedAfterTimeout) {
      break;
    }
  }

  const jsonPath = path.join(outputDirectory, "report.json");
  const markdownPath = path.join(outputDirectory, "report.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, `${buildMarkdownReport(report)}\n`, "utf8");
  return { report, jsonPath, markdownPath };
};

module.exports = {
  DEFAULT_MAX_FILES,
  DEFAULT_SIZES,
  DEFAULT_TIMEOUT_MS,
  buildMarkdownReport,
  parseProbeArguments,
  probeThumbnailAttempt,
  runShellThumbnailProbe,
  usage
};
