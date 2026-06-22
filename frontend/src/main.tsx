import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { StudioProvider } from "./lib/studio";
import { SettingsProvider } from "./lib/settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <SettingsProvider>
          <StudioProvider>
            <App />
          </StudioProvider>
        </SettingsProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
