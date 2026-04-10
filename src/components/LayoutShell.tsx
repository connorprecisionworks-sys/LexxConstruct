"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";

/**
 * Client shell that conditionally renders the sidebar and adjusts the
 * main content offset. The login page gets a clean full-screen layout;
 * every other page gets the standard sidebar + offset.
 *
 * Because this is a client component and usePathname() resolves correctly
 * during SSR in the App Router, there is no hydration mismatch.
 */
export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/login";

  if (isAuth) {
    return <div className="flex-1 flex flex-col min-h-screen">{children}</div>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {children}
      </div>
    </>
  );
}
