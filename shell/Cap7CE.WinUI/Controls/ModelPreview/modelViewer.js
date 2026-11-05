import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { loadModel } from "./modelLoader.js";
import { sceneControls } from "./modelScene.js";

const canvas = document.getElementById("model");
let engine, scene, controls, disposed = false;
const post = value => { if (!disposed) window.chrome?.webview?.postMessage(value); };
const draw = () => scene?.render();
const refresh = () => { if (!disposed && scene) { engine.resize(); scene.render(); } };
function dispose() {
    if (disposed) return;
    disposed = true; window.removeEventListener("resize", refresh);
    engine?.stopRenderLoop(draw); scene?.dispose(); engine?.dispose(); scene = null;
}
window.modelPreview = {
    reset() { controls?.reset(); refresh(); },
    gray() { controls?.gray(); refresh(); },
    dispose
};
window.addEventListener("pagehide", dispose);
window.addEventListener("resize", refresh);
document.addEventListener("visibilitychange", () => {
    if (!engine || disposed) return;
    if (document.hidden) engine.stopRenderLoop(draw); else { engine.runRenderLoop(draw); refresh(); }
});
try {
    const response = await fetch("/config.json");
    if (!response.ok) throw new Error("model-config");
    const config = await response.json();
    engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: false });
    scene = new Scene(engine); controls = sceneControls(scene, canvas);
    const fallback = await loadModel(scene, config.source, config.extension);
    if (disposed) throw new Error("model-closed");
    controls.fit(); if (fallback) controls.gray(true);
    await scene.whenReadyAsync(); refresh(); engine.runRenderLoop(draw);
    post({ type: "ready", fallback });
} catch (error) {
    post({ type: "error", message: String(error?.message ?? error).slice(0, 1024) });
    dispose();
}
