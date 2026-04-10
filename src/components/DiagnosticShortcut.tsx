"use client";

import { useEffect, useState } from "react";

export function DiagnosticShortcut() {
  const [toast, setToast] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        triggerDownload();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function triggerDownload() {
    const a = document.createElement("a");
    a.href = "/api/diagnostic/export";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setToast(true);
    setTimeout(() => setToast(false), 2400);
  }

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg shadow-lg toast-fade pointer-events-none">
      Diagnostic export downloaded.
    </div>
  );
}
