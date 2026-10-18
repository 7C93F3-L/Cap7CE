export const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
};

export const isWorkspaceControlKeyboardTarget = (target: EventTarget | null) => target instanceof Element
  && Boolean(target.closest(".cap-workspace-tabs, .cap-workspace-rail, .cap-workspace-filter-panel, .cap-stable-sidebar-flyout, .cap-workspace-directory-picker, .cap-stable-explore-bar, .cap-catalog-directory-toolbar, .cap-catalog-sidebar, .cap-catalog-top-filters, .cap-catalog-details"));
