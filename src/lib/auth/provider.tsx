"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

/**
 * App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
 * QueryClient + toasts for the Boat Boyz desk.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "bg-surface text-fg border-border",
          },
        }}
      />
    </QueryClientProvider>
  );
}
