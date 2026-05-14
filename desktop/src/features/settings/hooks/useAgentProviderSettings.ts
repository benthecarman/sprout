import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AgentProviderSettingsInput,
  type AgentProviderSettingsLoadStatus,
  deleteAgentProviderSettings,
  getAgentProviderEnvPresence,
  getAgentProviderSettings,
  saveAgentProviderSettings,
} from "@/features/settings/lib/agentProviderSettingsApi.ts";

const AGENT_PROVIDER_SETTINGS_KEY = ["agent-provider-settings"] as const;
const AGENT_PROVIDER_ENV_KEY = ["agent-provider-env-presence"] as const;

export function useAgentProviderSettingsQuery() {
  return useQuery<AgentProviderSettingsLoadStatus>({
    queryKey: AGENT_PROVIDER_SETTINGS_KEY,
    queryFn: getAgentProviderSettings,
    // Settings are local — no network round-trip — but we still cache for
    // the duration of a single session so revisiting the panel is instant.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useAgentProviderEnvPresenceQuery() {
  return useQuery({
    queryKey: AGENT_PROVIDER_ENV_KEY,
    queryFn: getAgentProviderEnvPresence,
    // Env presence reflects the desktop process's parent env, which only
    // changes if the user relaunches Sprout. Cache forever within a session.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useSaveAgentProviderSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AgentProviderSettingsInput) =>
      saveAgentProviderSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AGENT_PROVIDER_SETTINGS_KEY,
      });
    },
  });
}

export function useDeleteAgentProviderSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAgentProviderSettings(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AGENT_PROVIDER_SETTINGS_KEY,
      });
    },
  });
}
