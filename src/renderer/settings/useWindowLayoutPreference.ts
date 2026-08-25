import { useEffect, useState } from "react";
import type { UserPreferences } from "../../shared/types";

export const useWindowLayoutPreference = () => {
  const [rememberWindowLayout, setRememberWindowLayout] = useState(false);
  const [edgeCollapseEnabled, setEdgeCollapseEnabled] = useState(false);
  const hydrate = (preferences: UserPreferences) => {
    setRememberWindowLayout(preferences.rememberWindowLayout);
    setEdgeCollapseEnabled(preferences.edgeCollapseEnabled);
  };
  const load = () => { void window.cap7ce?.preferences.get().then((preferences) => { if (preferences) hydrate(preferences); }); };
  const update = async (enabled: boolean) => {
    setRememberWindowLayout(enabled);
    const preferences = await window.cap7ce?.preferences.updateRememberWindowLayout(enabled);
    if (preferences) hydrate(preferences);
  };
  const updateEdgeCollapse = async (enabled: boolean) => {
    setEdgeCollapseEnabled(enabled);
    const preferences = await window.cap7ce?.preferences.updateEdgeCollapse(enabled);
    if (preferences) hydrate(preferences);
  };
  useEffect(() => {
    const unsubscribe = window.cap7ce?.preferences.onEdgeCollapseEnabledChanged?.(setEdgeCollapseEnabled);
    return () => unsubscribe?.();
  }, []);
  return { edgeCollapseEnabled, rememberWindowLayout, load, update, updateEdgeCollapse };
};
