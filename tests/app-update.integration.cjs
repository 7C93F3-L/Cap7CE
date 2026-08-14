const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const release = (version, overrides = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  assets: [{
    name: `Cap7CE-${version}-win-x64.zip`,
    state: "uploaded",
    browser_download_url: `https://github.com/7C93F3-L/Cap7CE/releases/download/v${version}/Cap7CE-${version}-win-x64.zip`
  }],
  ...overrides
});

(async () => {
  const { checkForAppUpdate, downloadAppUpdate, selectLatestAppUpdate } = require("../dist-electron/appUpdateService.js");

  const latest = selectLatestAppUpdate([
    release("0.8.1"),
    release("0.9.0", { draft: true }),
    release("0.8.2", {
      assets: [{
        name: "Cap7CE-0.8.2-win-x64.zip",
        state: "uploaded",
        browser_download_url: "https://example.com/Cap7CE-0.8.2-win-x64.zip"
      }]
    })
  ]);
  assert.deepEqual(latest, {
    version: "0.8.1",
    downloadUrl: "https://github.com/7C93F3-L/Cap7CE/releases/download/v0.8.1/Cap7CE-0.8.1-win-x64.zip"
  });

  const available = await checkForAppUpdate(
    "0.8.0",
    async () => ({
      ok: true,
      json: async () => [release("0.8.1")]
    })
  );
  assert.equal(available.status, "update_available");
  assert.equal(available.latestVersion, "0.8.1");
  assert.equal(available.downloadUrl, "https://github.com/7C93F3-L/Cap7CE/releases/download/v0.8.1/Cap7CE-0.8.1-win-x64.zip");

  const current = await checkForAppUpdate(
    "0.8.1",
    async () => ({
      ok: true,
      json: async () => [release("0.8.1"), release("0.8.0")]
    })
  );
  assert.equal(current.status, "up_to_date");
  assert.equal(current.latestVersion, "0.8.1");
  assert.equal(current.downloadUrl, undefined);

  const unavailable = await checkForAppUpdate(
    "0.8.0",
    async () => ({ ok: false })
  );
  assert.equal(unavailable.status, "failed");

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-update-test-"));
  try {
    const destinationPath = path.join(temporaryRoot, "Cap7CE-0.8.3-win-x64.zip");
    const payload = Buffer.from("test-update-package");
    const progress = [];
    const downloaded = await downloadAppUpdate(
      {
        version: "0.8.3",
        downloadUrl: release("0.8.3").assets[0].browser_download_url
      },
      destinationPath,
      (entry) => progress.push(entry),
      async () => new Response(payload, { headers: { "content-length": String(payload.length) } })
    );
    assert.equal(downloaded.receivedBytes, payload.length);
    assert.deepEqual(await fs.readFile(destinationPath), payload);
    assert.equal(progress.at(-1).percent, 100);
    assert.equal(progress[0].completed, false);
    assert.equal(progress.at(-1).completed, true);
    await assert.rejects(fs.access(`${destinationPath}.part`));

    const stalledDestinationPath = path.join(temporaryRoot, "stalled.zip");
    const stalledBody = new ReadableStream({
      cancel() {}
    });
    await assert.rejects(
      downloadAppUpdate(
        {
          version: "0.8.3",
          downloadUrl: release("0.8.3").assets[0].browser_download_url
        },
        stalledDestinationPath,
        () => undefined,
        async () => new Response(stalledBody, { headers: { "content-length": "100" } }),
        50
      ),
      /stopped receiving data/
    );
    await assert.rejects(fs.access(stalledDestinationPath));

    const cancelledDestinationPath = path.join(temporaryRoot, "cancelled.zip");
    const cancelledController = new AbortController();
    const cancelledBody = new ReadableStream({ cancel() {} });
    const cancelledDownload = downloadAppUpdate(
      {
        version: "0.8.3",
        downloadUrl: release("0.8.3").assets[0].browser_download_url
      },
      cancelledDestinationPath,
      () => undefined,
      async () => new Response(cancelledBody, { headers: { "content-length": "100" } }),
      5_000,
      cancelledController.signal
    );
    cancelledController.abort();
    await assert.rejects(cancelledDownload, (error) => error.code === "cancelled");
    await assert.rejects(fs.access(cancelledDestinationPath));
    await assert.rejects(fs.access(`${cancelledDestinationPath}.part`));

    await assert.rejects(
      downloadAppUpdate(
        {
          version: "0.8.3",
          downloadUrl: release("0.8.3").assets[0].browser_download_url
        },
        path.join(temporaryRoot, "limited.zip"),
        () => undefined,
        async () => new Response(null, { status: 429 })
      ),
      (error) => error.code === "rate_limited"
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log("App update integration checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
