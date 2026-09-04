import type { ReactNode } from "react";
import "./DialogShell.css";

interface DialogShellProps {
  label: string;
  children: ReactNode;
  stable?: boolean;
}

const DialogShell = ({ label, children, stable = false }: DialogShellProps) => (
  <main className={`keyword-editor-view delete-files-view cap-dialog-layer${stable ? " is-stable" : ""}`}>
    <section className="keyword-editor-panel delete-files-panel cap-dialog-surface" role="alertdialog" aria-modal="true" aria-label={label}>
      <div className="delete-files-content cap-dialog-content">{children}</div>
    </section>
  </main>
);

export default DialogShell;
