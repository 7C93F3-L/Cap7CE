import { useEffect, useRef, useState } from "react";
import type { WorkspaceSelectionMemory } from "../../shared/workspaceTypes";

export const useResultSelectionMemory = (selectedImageId: string | null, memory?: WorkspaceSelectionMemory) => {
  const [selectedImageIds, setSelectedImageIds] = useState(() => new Set(memory?.ids ?? (selectedImageId ? [selectedImageId] : [])));
  const selectionAnchorIdRef = useRef<string | null>(selectedImageId);
  useEffect(() => { memory?.onChange([...selectedImageIds]); }, [memory, selectedImageIds]);
  return { selectedImageIds, setSelectedImageIds, selectionAnchorIdRef };
};
