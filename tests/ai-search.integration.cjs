const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createAiSearchCandidatePlan } = require("../dist-electron/aiSearchCandidateService.js");
const {
  AiSearchSingleImageError,
  parseAiSearchVisualScore,
  requestAiSearchSingleImageScore
} = require("../dist-electron/aiSearchSingleImageModel.js");
const { AiSearchService } = require("../dist-electron/aiSearchService.js");
const { parseAssistantInvocation } = require("../src/renderer/assistant/assistantInvocation.ts");
const { hasAiSearchScopeChanged, mergeAiSearchResults } = require("../src/renderer/ai-search/aiSearchState.ts");

assert.deepEqual(parseAssistantInvocation("  7CE/沙漠 夜晚"), { requested: true, query: "沙漠 夜晚" });
assert.deepEqual(parseAssistantInvocation("ai:沙漠"), { requested: false, query: "ai:沙漠" });

const plan = createAiSearchCandidatePlan("图片 去年 红色衣服", new Date("2026-08-23T12:00:00+08:00"));
assert.ok(plan.hardQueryPlan.terms.length >= 2);
assert.deepEqual(plan.visualTerms, ["红色衣服"]);

assert.equal(parseAiSearchVisualScore("<think>ignored</think>\n2"), 2);
assert.throws(() => parseAiSearchVisualScore("score: 2"), (error) => error instanceof AiSearchSingleImageError && error.code === "invalid_response");

const base = [{ filePath: "C:\\base.png" }];
const ai = [{ filePath: "C:\\AI.png" }, { filePath: "c:\\base.png" }];
assert.deepEqual(mergeAiSearchResults(base, ai).map((item) => item.filePath), ["C:\\base.png", "C:\\AI.png"]);

const search = { query: "沙漠", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc" };
assert.equal(hasAiSearchScopeChanged(search, { ...search, sortDirection: "desc" }), false);
assert.equal(hasAiSearchScopeChanged(search, { ...search, directoryId: "design" }), true);

const testSingleImageRequest = async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "2" } }] })
    };
  };
  try {
    assert.equal(await requestAiSearchSingleImageScore(
      { baseUrl: "http://127.0.0.1:1", modelName: "test" },
      "data:image/jpeg;base64,AA==",
      "黑色上衣",
      new AbortController().signal
    ), 2);
    assert.equal(requestBody.temperature, 0);
    assert.equal(requestBody.max_tokens, 4);
    assert.equal(requestBody.chat_template_kwargs.enable_thinking, false);
    assert.match(requestBody.grammar, /0/);
    assert.equal(requestBody.messages[0].content.filter((part) => part.type === "image_url").length, 1);
    assert.match(requestBody.messages[0].content[1].text, /只判断一个条件/);
    assert.match(requestBody.messages[0].content[1].text, /画面中清楚可见“黑色上衣”/);
    assert.doesNotMatch(requestBody.messages[0].content[1].text, /不确定时优先返回 0/);
  } finally {
    global.fetch = originalFetch;
  }
};

const candidate = (id, fileName) => ({
  id: String(id), resultKind: "visual", filePath: `C:\\${fileName}`, fileName,
  extension: ".png", iconName: "skim-file", previewKind: "image", canShellPreview: false,
  fileSize: 100 + id, createdAt: "2026-08-24T00:00:00.000Z", modifiedAt: "2026-08-24T00:00:00.000Z",
  imageWidth: 100, imageHeight: 100, caption: "", keywords: [], aiKeywords: [], userDescription: "",
  isRecognized: false, aiError: "", failureType: "pending", failureLabel: "", indexedAt: "",
  thumbnailUrl: "", searchEvidence: null
});

const waitForPhase = (service, request, targetPhase, updates) => new Promise(async (resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${targetPhase}`)), 1_000);
  const response = await service.start(request, (update) => {
    updates.push(update);
    if (update.type === "status" && update.phase === targetPhase) {
      clearTimeout(timeout);
      resolve(response);
    }
  });
});

const testCascadeAndCache = async () => {
  const candidates = [candidate(1, "one.png"), candidate(2, "two.png"), candidate(3, "three.png"), candidate(7, "four.png")];
  const scores = new Map([
    ["one.png:女", 2], ["one.png:黑色上衣", 2],
    ["two.png:女", 2], ["two.png:黑色上衣", 1],
    ["three.png:女", 0],
    ["four.png:女", 2], ["four.png:黑色上衣", 2]
  ]);
  const scoreCalls = [];
  const cacheWrites = [];
  const updates = [];
  let runtimeBegins = 0;
  let runtimeEnds = 0;
  let currentFileName = "";
  const service = new AiSearchService({
    listCandidates: async () => ({ candidates, visualTerms: ["女", "黑色上衣"] }),
    ensureRuntime: async () => ({ baseUrl: "http://test", modelName: "test" }),
    beginRuntimeUse: () => { runtimeBegins += 1; },
    endRuntimeUse: () => { runtimeEnds += 1; },
    getModelId: async () => "qwen3.5-0.8b-q8_0.gguf",
    prepareImage: async (filePath) => {
      currentFileName = filePath.split("\\").pop();
      return "data:image/jpeg;base64,AA==";
    },
    scoreImage: async (_connection, _dataUrl, term) => {
      scoreCalls.push(`${currentFileName}:${term}`);
      return scores.get(`${currentFileName}:${term}`);
    },
    saveEvidence: async (entries) => cacheWrites.push(...entries)
  });
  await waitForPhase(service, { sessionId: "cascade-session", search, excludeFilePaths: [] }, "completed", updates);
  assert.deepEqual(scoreCalls, ["one.png:女", "one.png:黑色上衣", "two.png:女", "two.png:黑色上衣", "three.png:女", "four.png:女", "four.png:黑色上衣"]);
  assert.equal(scoreCalls.some((call) => call.includes("同时满足全部条件")), false);
  assert.deepEqual(updates.filter((update) => update.type === "batch").flatMap((update) => update.matches).map((item) => item.fileName), ["one.png", "four.png"]);
  assert.deepEqual(cacheWrites.map((entry) => [entry.imageId, entry.keywords]), [[1, ["女", "黑色上衣"]], [7, ["女", "黑色上衣"]]]);
  assert.deepEqual([runtimeBegins, runtimeEnds], [1, 1]);
};

assert.match(
  fs.readFileSync(require.resolve("../dist-electron/llamaRuntimeManager.js"), "utf8"),
  /"--image-min-tokens",\s*"1024"/,
  "llama-server must keep the validated 1024-token vision baseline"
);

const testUserPauseAtSafeCheckpoint = async () => {
  let scoreCall = 0;
  let runtimeBegins = 0;
  let runtimeEnds = 0;
  const updates = [];
  const service = new AiSearchService({
    listCandidates: async () => ({ candidates: [candidate(6, "six.png")], visualTerms: ["做饭"] }),
    ensureRuntime: async () => ({ baseUrl: "http://test", modelName: "test" }),
    beginRuntimeUse: () => { runtimeBegins += 1; },
    endRuntimeUse: () => { runtimeEnds += 1; },
    getModelId: async () => "model",
    prepareImage: async () => "data:image/jpeg;base64,AA==",
    scoreImage: async (_connection, _dataUrl, _term, signal) => {
      scoreCall += 1;
      if (scoreCall > 1) return 2;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    },
    saveEvidence: async () => undefined
  });
  const request = { sessionId: "pause-session", search, excludeFilePaths: [] };
  const paused = waitForPhase(service, request, "paused_user", updates);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.cancel(request.sessionId), true);
  await paused;
  const resumedUpdates = [];
  await waitForPhase(service, request, "completed", resumedUpdates);
  assert.equal(scoreCall, 2, "the interrupted candidate must restart from its safe checkpoint");
  assert.equal(resumedUpdates.some((update) => update.type === "batch"), true);
  assert.deepEqual([runtimeBegins, runtimeEnds], [2, 2]);
};

const testPauseWhileWaitingForRuntimeOwnership = async () => {
  let releaseRuntimeOwnership;
  let ensureRuntimeCalls = 0;
  let runtimeEnds = 0;
  const updates = [];
  const service = new AiSearchService({
    listCandidates: async () => ({ candidates: [candidate(8, "eight.png")], visualTerms: ["跑步"] }),
    beginRuntimeUse: () => new Promise((resolve) => { releaseRuntimeOwnership = resolve; }),
    endRuntimeUse: () => { runtimeEnds += 1; },
    ensureRuntime: async () => {
      ensureRuntimeCalls += 1;
      return { baseUrl: "http://test", modelName: "test" };
    },
    getModelId: async () => "model",
    prepareImage: async () => "data:image/jpeg;base64,AA==",
    scoreImage: async () => 2,
    saveEvidence: async () => undefined
  });
  const request = { sessionId: "runtime-wait-session", search, excludeFilePaths: [] };
  const paused = waitForPhase(service, request, "paused_user", updates);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.cancel(request.sessionId), true);
  releaseRuntimeOwnership();
  await paused;
  assert.equal(ensureRuntimeCalls, 0, "a paused search must not restart llama-server after an idle stop finishes");
  assert.equal(runtimeEnds, 1);
};

Promise.all([
  testSingleImageRequest(),
  testCascadeAndCache(),
  testUserPauseAtSafeCheckpoint(),
  testPauseWhileWaitingForRuntimeOwnership()
]).then(() => {
  console.log("AI search single-image cascade, candidate planning and preserved-result tests passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
