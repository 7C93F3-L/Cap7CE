export type SettingsCategoryIconName = "general" | "appearance" | "browse" | "search-ai" | "cache" | "shortcuts" | "diagnostics" | "about";

const SettingsCategoryIcon = ({ name }: { name: SettingsCategoryIconName }) => (
  <svg className="cap-stable-settings-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "general" && <><path d="M4 7h5M15 7h5M4 17h9M17 17h3" /><circle cx="12" cy="7" r="3" /><circle cx="15" cy="17" r="2" /></>}
    {name === "appearance" && <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>}
    {name === "browse" && <><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M3.5 10h17" /></>}
    {name === "search-ai" && <><circle cx="10" cy="11" r="5.5" /><path d="m14 15 4.5 4.5M18 3v4M16 5h4" /></>}
    {name === "cache" && <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>}
    {name === "shortcuts" && <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M11 9h.01M15 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h3M7 16h8" /></>}
    {name === "diagnostics" && <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M6 12h3l2-4 3 8 2-4h2" /></>}
    {name === "about" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>}
  </svg>
);

export default SettingsCategoryIcon;
