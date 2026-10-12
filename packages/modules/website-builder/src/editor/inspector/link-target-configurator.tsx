import React from "react";
import { Input, Checkbox } from "@suite/ui";
import type { LinkTargetConfiguratorProps } from "./types.js";
import type { LinkTarget } from "../../ast/types.js";

export function LinkTargetConfigurator({
  label = "Action Link",
  target,
  onChange,
  className = "",
}: LinkTargetConfiguratorProps) {
  const currentTarget: LinkTarget = target || { url: "" };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...currentTarget,
      url: e.target.value,
    });
  };

  const handleOpenInNewTabChange = (checked: boolean) => {
    onChange({
      ...currentTarget,
      openInNewTab: checked,
      rel: checked ? "noopener noreferrer" : undefined,
    });
  };

  return (
    <div className={`space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg ${className}`}>
      <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">
        {label}
      </span>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Destination URL</label>
        <Input
          type="text"
          value={currentTarget.url}
          onChange={handleUrlChange}
          placeholder="/pricing or https://example.com"
          className="h-8 text-xs bg-white"
        />
      </div>

      <div className="pt-1">
        <Checkbox
          id="link-target-new-tab"
          label="Open link in new tab"
          checked={!!currentTarget.openInNewTab}
          onChange={(e) => handleOpenInNewTabChange(e.target.checked)}
        />
      </div>
    </div>
  );
}
