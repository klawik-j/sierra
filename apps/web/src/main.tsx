import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ConfirmProvider } from "./components/ui";
import { LocaleProvider } from "./lib/i18n";
import { ToastProvider } from "./lib/toast";
import "./index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
