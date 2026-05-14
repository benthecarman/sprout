import * as React from "react";

import type { SettingsSection } from "@/features/settings/ui/SettingsPanels";

type AppShellContextValue = {
  markChannelRead: (
    channelId: string,
    readAt: string | null | undefined,
  ) => void;
  openChannelManagement: () => void;
  /**
   * Open the Settings sheet, optionally jumping to a specific section.
   * Wired into `AppShell`'s settings state — callers don't need to know
   * about the underlying `setSettingsOpen`/`setSettingsSection` pair.
   */
  openSettings: (section?: SettingsSection) => void;
};

const AppShellContext = React.createContext<AppShellContextValue>({
  markChannelRead: () => {},
  openChannelManagement: () => {},
  openSettings: () => {},
});

export function AppShellProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AppShellContextValue;
}) {
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  return React.useContext(AppShellContext);
}
