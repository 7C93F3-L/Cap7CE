export default function SettingsMetadataGlyph({ name }: { name: "back" | "up" | "down" | "drive" | "folder" | "close" }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "back" ? <path d="m14 6-6 6 6 6M8 12h12" /> : name === "up" ? <path d="m7 14 5-5 5 5" /> : name === "down" ? <path d="m7 10 5 5 5-5" /> : name === "close" ? <path d="m7 7 10 10M7 17 17 7" /> : name === "folder" ? <path d="M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11H3V7Z" /> : <><path d="m5 4-3 11v5h20v-5L19 4ZM2 15h20" /><path d="M17 18h2" /></>}
  </svg>;
}
