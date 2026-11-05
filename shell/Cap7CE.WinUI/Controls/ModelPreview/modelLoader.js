import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { OBJFileLoader } from "@babylonjs/loaders/OBJ/objFileLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import "@babylonjs/loaders/OBJ/index.js";

export function geometryOnly(text) {
    return text.replace(/^(?:vn\s|vt\s|mtllib\s|usemtl\s).*(?:\r?\n|$)/gm, "")
        .replace(/^f\s+(.*)$/gm, (_, face) => "f " + face.trim().split(/\s+/).map(value => value.split("/")[0]).join(" "));
}

export async function loadModel(scene, source, extension) {
    if (![".glb", ".gltf", ".obj"].includes(extension)) throw new Error("model-format");
    const base = source.slice(0, source.lastIndexOf("/") + 1), name = source.slice(base.length);
    try {
        await SceneLoader.ImportMeshAsync(null, base, name, scene, undefined, extension);
        return false;
    } catch (error) {
        if (extension !== ".obj") throw error;
        for (const mesh of scene.meshes.slice()) mesh.dispose(false, true);
        const response = await fetch(source);
        if (!response.ok) throw new Error("model-read");
        const text = geometryOnly(await response.text());
        await new OBJFileLoader({ skipMaterials: true, computeNormals: true }).importMeshAsync(null, scene, text, base);
        return true;
    }
}
