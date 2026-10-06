const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { readVideoMetadataFrames, videoMetadataProperties } = require("../dist-electron/metadataExtraction/videoMetadataFrames.js");
const { VideoMetadataFrameClient } = require("../dist-electron/metadataExtraction/videoMetadataFrameClient.js");
const frame = (rgba) => ({ width: 1, height: 1, rgba: Buffer.from(rgba).toString("base64") });
const response = (id, residentBytes = 100) => ({ id, state: "indexed", width: 640, height: 480, durationMilliseconds: 3000,
  frames: [frame([255,0,0,255]), frame([0,255,0,255]), frame([0,0,255,255])], residentBytes });
const vector = videoMetadataProperties(readVideoMetadataFrames(response(1), 1));
for (const color of ["red", "green", "blue"]) assert.equal(vector[`colorRatio.${color}`], 3333);
for (const invalid of [{...response(1),id:2}, {...response(1),state:"failed"}, {...response(1),residentBytes:-1},
  {...response(1),durationMilliseconds:1.2}, {...response(1),frames:[]}, {...response(1),extra:true},
  {...response(1),frames:[frame([1,2,3]), ...response(1).frames.slice(1)]},
  {...response(1),frames:[{...frame([1,2,3,4]),width:161}, ...response(1).frames.slice(1)]},
  {...response(1),frames:[{...frame([1,2,3,4]),rgba:"AQIDBA==\n"}, ...response(1).frames.slice(1)]}])
  assert.throws(() => readVideoMetadataFrames(invalid,1), /invalid-frame-response/);
const children = [];
let behavior = "healthy", closes = 0;
const spawnHelper = (_path, args, options) => {
  assert.deepEqual(args,["--parent-pid", String(process.pid)]); assert.equal(options.windowsHide,true);
  const child = new EventEmitter(); child.pid = 123; child.exitCode = null; child.signalCode = null;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { setTimeout(() => { child.exitCode = 0; closes++; child.emit("close",0); },30); return true; };
  child.stdin = new Writable({ write(bytes, _encoding, done) {
    const {id} = JSON.parse(bytes); const mode = behavior;
    setImmediate(() => {
      if (mode === "hang") return;
      if (mode === "oversized") return child.stdout.write(Buffer.alloc(512*1024+1));
      const reply = JSON.stringify(response(mode === "wrong-id" ? id+1 : id,mode === "recycle" ? 193*1024*1024 : 100))+"\n";
      child.stdout.write(reply.slice(0,30)); child.stdout.write(reply.slice(30));
    }); done();
  }});
  children.push(child); return child;
};
(async () => {
  const client = new VideoMetadataFrameClient("owned-helper.exe", spawnHelper);
  const signal = new AbortController().signal;
  for(let index=0;index<17;index++) assert.equal((await client.extract("X:\\generated.mp4",signal)).state,"indexed");
  assert.equal(children.length,2,"the seventeenth request waits for native retirement and starts a new owner");
  assert.equal(closes,1);
  behavior="recycle"; await client.extract("X:\\generated.mp4",signal);
  behavior="healthy"; await client.extract("X:\\generated.mp4",signal); assert.equal(closes,2);
  behavior="wrong-id"; await assert.rejects(client.extract("X:\\generated.mp4",signal),/invalid-response/);
  behavior="oversized"; await assert.rejects(client.extract("X:\\generated.mp4",signal),/too-large/);
  behavior="hang"; const abort = new AbortController(); const pending = client.extract("X:\\generated.mp4",abort.signal);
  await new Promise(resolve=>setTimeout(resolve,50)); abort.abort(); await assert.rejects(pending,/cancelled/);
  await assert.rejects(client.extract("X:\\generated.mp4",signal),/timeout/);
  behavior="healthy"; assert.equal((await client.extract("X:\\generated.mp4",signal)).state,"indexed");
  await client.close(); assert.equal(closes,children.length,"closing joins every owned process");
  await assert.rejects(client.extract("X:\\generated.mp4",signal),/unavailable/);
  assert.equal(await new VideoMetadataFrameClient(undefined).extract("X:\\generated.mp4",signal),null);
  console.log("Video frame validation, representative colors, bounded reuse, cancellation and retirement passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
