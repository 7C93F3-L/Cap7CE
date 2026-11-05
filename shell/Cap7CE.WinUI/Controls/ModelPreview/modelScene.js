import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

export function sceneControls(scene, canvas) {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera("camera", -Math.PI / 3, Math.PI / 3, 5, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;
    new HemisphericLight("ambient", Vector3.Up(), scene).intensity = 0.65;
    new DirectionalLight("key", new Vector3(-1, -2, 1), scene).intensity = 0.75;
    const originals = new Map();
    let reset = () => {}, gray = false;
    return {
        fit() {
            const meshes = scene.meshes.filter(mesh => mesh.getTotalVertices() > 0);
            if (!meshes.length) throw new Error("model-empty");
            let min = new Vector3(Infinity, Infinity, Infinity), max = min.negate();
            for (const mesh of meshes) {
                mesh.computeWorldMatrix(true);
                const box = mesh.getBoundingInfo().boundingBox;
                min = Vector3.Minimize(min, box.minimumWorld); max = Vector3.Maximize(max, box.maximumWorld);
            }
            const extent = max.subtract(min), size = Math.max(extent.x, extent.y, extent.z, 0.001);
            if (![min.x, min.y, min.z, size].every(Number.isFinite)) throw new Error("model-bounds");
            const target = min.add(max).scale(0.5);
            reset = () => { camera.target = target; camera.radius = size * 1.8; camera.alpha = -Math.PI / 3; camera.beta = Math.PI / 3; };
            reset(); camera.lowerRadiusLimit = size * 0.02; camera.upperRadiusLimit = size * 20;
            camera.minZ = size * 0.0001; camera.maxZ = size * 100;
        },
        reset: () => reset(),
        gray(force) {
            gray = force ?? !gray;
            let material = scene.getMaterialByName("preview-gray");
            if (!material) {
                material = new StandardMaterial("preview-gray", scene);
                material.diffuseColor = new Color3(0.5, 0.52, 0.55);
                material.specularColor = new Color3(0.08, 0.08, 0.08); material.backFaceCulling = false;
            }
            for (const mesh of scene.meshes) if (mesh.getTotalVertices() > 0) {
                if (!originals.has(mesh)) originals.set(mesh, mesh.material);
                mesh.material = gray ? material : originals.get(mesh);
            }
        }
    };
}
