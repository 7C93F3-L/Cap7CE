// Keeps navigation intent until Settings has mounted, including its first load.
export function createSettingsMetadataBuildRequest(open: () => Promise<boolean>, notify?: () => void) {
  let pending = false;
  return {
    async request() {
      pending = true;
      try { if (await open()) { notify?.(); return true; } }
      catch { /* Opening Settings must not disrupt the requesting view. */ }
      pending = false; return false;
    },
    consume() { const value = pending; pending = false; return value; }
  };
}
