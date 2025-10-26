"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster({ ...props }: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      toastOptions={{
        style: {
          background: "rgba(24,25,35,0.94)",
          border: "1px solid rgba(120,122,160,0.28)",
          color: "#f5f5f7",
          backdropFilter: "blur(12px)"
        }
      }}
      {...props}
    />
  );
}
