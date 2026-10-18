import type { ReactNode, RefObject } from "react";
import CustomScrollbar from "../CustomScrollbar";
import SettingsMetadataBuildPage from "./metadata-build/SettingsMetadataBuildPage";
import type { SettingsIndexNavigation } from "./useSettingsIndexNavigation";

export default function SettingsContentFrame({ navigation, scrollRef, children }: {
  navigation: SettingsIndexNavigation; scrollRef: RefObject<HTMLDivElement>; children: ReactNode;
}) {
  return <div className="cap-stable-settings-content-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical">
    {navigation.open ? <SettingsMetadataBuildPage navigation={navigation} /> : <>
      <main className="cap-stable-settings-content cap-main-scroll-viewport" ref={scrollRef}><div className="cap-stable-settings-content-track">{children}</div></main>
      <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" /></>}
  </div>;
}
