// Task IDs identify Main authorization/thumbnail sessions, so two mounted views
// must never share one even when their clocks and local query sequences coincide.
export function createComputerSearchTaskIdGenerator(ownerFactory = () => crypto.randomUUID()) {
  const owner = ownerFactory();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)) throw new Error("invalid-search-owner");
  let ordinal = 0;
  return (kind: "search" | "refresh") => {
    if (!Number.isSafeInteger(ordinal + 1)) throw new Error("search-task-identity-exhausted");
    return `computer_${kind}_${owner}_${++ordinal}`;
  };
}
