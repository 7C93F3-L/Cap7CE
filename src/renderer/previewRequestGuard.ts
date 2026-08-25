export interface PreviewRequestGuard {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
  invalidate: () => void;
}

export const createPreviewRequestGuard = (): PreviewRequestGuard => {
  let requestId = 0;

  return {
    begin: () => {
      requestId += 1;
      return requestId;
    },
    isCurrent: (candidateRequestId) => candidateRequestId === requestId,
    invalidate: () => {
      requestId += 1;
    }
  };
};
