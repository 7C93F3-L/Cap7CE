import path from "node:path";
import type { SevenZipModule } from "7z-wasm";

type Operation = (...args: unknown[]) => unknown;
interface NativeFilesystem {
  node_ops: Record<string, Operation>;
  stream_ops: Record<string, Operation>;
  realPath(node: unknown): string;
}

// Each archive listing has its own module. Keep its NODEFS read-only and expose
// only the granted file, even if the archive parser seeks adjacent split volumes.
export const restrictArchiveSourceFilesystem = (module: SevenZipModule, sourcePath: string) => {
  const native = module.NODEFS as unknown as NativeFilesystem;
  const sourceName = path.basename(sourcePath), expected = path.normalize(sourcePath).toLowerCase();
  const { ErrnoError } = module.FS as unknown as { ErrnoError: new (code: number) => Error };
  const denied = (): never => { throw new ErrnoError(2); };
  const lookup = native.node_ops.lookup, open = native.stream_ops.open;
  native.node_ops = { ...native.node_ops, lookup: (parent, name) => name === sourceName ? lookup(parent, name) : denied(),
    readdir: () => [".", "..", sourceName] };
  for (const action of ["setattr", "mknod", "rename", "unlink", "rmdir", "symlink"]) native.node_ops[action] = denied;
  native.stream_ops = { ...native.stream_ops, open: (value) => {
    const stream = value as { node: unknown; flags: number };
    if (path.normalize(native.realPath(stream.node)).toLowerCase() !== expected || (stream.flags & (3 | 64 | 512 | 1024))) return denied();
    return open(stream);
  }, write: denied, msync: denied };
};
