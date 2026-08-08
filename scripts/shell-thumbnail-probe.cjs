const { app, nativeImage } = require("electron");
const {
  parseProbeArguments,
  runShellThumbnailProbe,
  usage
} = require("./shell-thumbnail-probe-core.cjs");

let options;
try {
  options = parseProbeArguments(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  app.exit(1);
}

if (options?.help) {
  console.log(usage);
  app.exit(0);
} else if (options) {
  app.whenReady().then(async () => {
    const result = await runShellThumbnailProbe({
      createThumbnail: (filePath, size) => nativeImage.createThumbnailFromPath(filePath, size),
      inputPath: options.inputPath,
      outputDirectory: options.outputDirectory,
      timeoutMs: options.timeoutMs,
      maxFiles: options.maxFiles
    });
    console.log(JSON.stringify({
      reportDirectory: options.outputDirectory,
      markdownReport: result.markdownPath,
      jsonReport: result.jsonPath,
      samplesCompleted: result.report.samples.length,
      abortedAfterTimeout: result.report.abortedAfterTimeout
    }, null, 2));
    app.exit(0);
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });
}
