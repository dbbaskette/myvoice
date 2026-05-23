import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { ComposePage } from "./routes/ComposePage";
import { PackDetailPage } from "./routes/PackDetailPage";
import { PacksPage } from "./routes/PacksPage";
import { SettingsPage } from "./routes/SettingsPage";

export function App(): JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PacksPage />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/packs/:slug/*" element={<PackDetailPage />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/compose/:slug" element={<ComposePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
