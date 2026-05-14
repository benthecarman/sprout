import type { FormState } from "@/features/settings/lib/agentProviderFormState.ts";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

/**
 * Collapsible "Advanced" block of the Agent Provider settings card.
 * Renders the optional behavior knobs and the MCP-hooks footnote. Lifted
 * out of the parent card to keep file sizes obvious and the parent's
 * form-orchestration logic readable.
 */
export function AgentProviderAdvancedFields({
  form,
  open,
  onToggle,
  onChange,
}: {
  form: FormState;
  open: boolean;
  onToggle: (open: boolean) => void;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <details
      className="rounded-xl border border-border/60 bg-muted/20"
      onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}
      open={open}
    >
      <summary
        className="cursor-pointer select-none px-3 py-2 text-sm font-medium"
        data-testid="agent-provider-advanced-toggle"
      >
        Advanced
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs text-muted-foreground"
            htmlFor="agent-provider-system-prompt"
          >
            System prompt override (capped at 32 KB)
          </label>
          <Textarea
            data-testid="agent-provider-system-prompt"
            id="agent-provider-system-prompt"
            onChange={(e) => onChange("systemPrompt", e.target.value)}
            placeholder="Leave empty to use sprout-agent's default."
            rows={4}
            value={form.systemPrompt}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            id="agent-provider-max-rounds"
            label="Max rounds (0 = unlimited)"
            onChange={(v) => onChange("maxRounds", v)}
            placeholder="0"
            value={form.maxRounds}
          />
          <NumberField
            id="agent-provider-max-output-tokens"
            label="Max output tokens"
            onChange={(v) => onChange("maxOutputTokens", v)}
            placeholder="4096"
            value={form.maxOutputTokens}
          />
          <NumberField
            id="agent-provider-llm-timeout"
            label="LLM timeout (seconds)"
            onChange={(v) => onChange("llmTimeoutSecs", v)}
            placeholder="120"
            value={form.llmTimeoutSecs}
          />
          <NumberField
            id="agent-provider-tool-timeout"
            label="Tool timeout (seconds)"
            onChange={(v) => onChange("toolTimeoutSecs", v)}
            placeholder="660"
            value={form.toolTimeoutSecs}
          />
          <div className="sm:col-span-2">
            <NumberField
              id="agent-provider-max-history-bytes"
              label="Max history bytes (minimum 1,048,576)"
              onChange={(v) => onChange("maxHistoryBytes", v)}
              placeholder="1048576"
              value={form.maxHistoryBytes}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          MCP hooks for sprout-agent are managed by Sprout and not exposed here.
          Operator knobs (MCP restart, hook timeouts, max sessions) are
          inherited from your shell environment.
        </p>
      </div>
    </details>
  );
}

function NumberField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        data-testid={id}
        id={id}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}
