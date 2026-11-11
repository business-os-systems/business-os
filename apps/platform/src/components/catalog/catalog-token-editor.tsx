"use client";

import { useState } from "react";
import { Alert, Button, Input, Label } from "@suite/ui";
import type { CatalogIssue } from "@/lib/catalog-schema";
import { isSafeTokenKey } from "./catalog-token-operations";

type Tokens = Record<string, string | number>;

interface CatalogTokenEditorProps {
  readonly tokens: Tokens;
  readonly issues: readonly CatalogIssue[];
  readonly disabled: boolean;
  readonly onAdd: (key: string, value: string) => void;
  readonly onChange: (key: string, value: string) => void;
  readonly onRemove: (key: string) => void;
}

function tokenKeyError(key: string, tokens: Tokens): string | null {
  const trimmed = key.trim();
  if (!isSafeTokenKey(trimmed)) {
    return "Use a non-empty key up to 128 characters that is not reserved.";
  }
  if (Object.prototype.hasOwnProperty.call(tokens, trimmed)) {
    return "That token key already exists.";
  }
  return null;
}

function TokenRow({
  tokenKey,
  value,
  disabled,
  onChange,
  onRemove,
}: {
  readonly tokenKey: string;
  readonly value: string | number;
  readonly disabled: boolean;
  readonly onChange: (key: string, value: string) => void;
  readonly onRemove: (key: string) => void;
}) {
  const inputId = `catalog-token-${encodeURIComponent(tokenKey)}`;
  return (
    <div className="flex items-end gap-2">
      <div className="w-1/3">
        <Label htmlFor={inputId} className="text-xs font-medium text-text">
          {tokenKey}
        </Label>
      </div>
      <div className="flex-1">
        <Input
          id={inputId}
          value={String(value)}
          disabled={disabled}
          aria-label={`Value for ${tokenKey}`}
          onChange={(event) => onChange(tokenKey, event.target.value)}
        />
      </div>
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(tokenKey)}>
        Remove
      </Button>
    </div>
  );
}

function TokenAddRow({
  tokens,
  disabled,
  onAdd,
}: {
  readonly tokens: Tokens;
  readonly disabled: boolean;
  readonly onAdd: (key: string, value: string) => void;
}) {
  const [nextKey, setNextKey] = useState("");
  const [nextValue, setNextValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function addToken(): void {
    const error = tokenKeyError(nextKey, tokens);
    if (error !== null) {
      setLocalError(error);
      return;
    }
    onAdd(nextKey.trim(), nextValue);
    setNextKey("");
    setNextValue("");
    setLocalError(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <div className="w-40">
          <Label htmlFor="catalog-token-new-key" className="text-xs font-medium text-text">
            New token key
          </Label>
          <Input
            id="catalog-token-new-key"
            value={nextKey}
            disabled={disabled}
            onChange={(event) => setNextKey(event.target.value)}
          />
        </div>
        <div className="min-w-40 flex-1">
          <Label htmlFor="catalog-token-new-value" className="text-xs font-medium text-text">
            Value
          </Label>
          <Input
            id="catalog-token-new-value"
            value={nextValue}
            disabled={disabled}
            onChange={(event) => setNextValue(event.target.value)}
          />
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={addToken}>
          Add token
        </Button>
      </div>
      {localError === null ? null : <Alert variant="error" title="Token key rejected" message={localError} />}
    </div>
  );
}

function TokenIssues({ issues }: { readonly issues: readonly CatalogIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <Alert
      variant="error"
      title="Token validation failed"
      message={
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>
              <span className="font-mono text-xs">{issue.path}</span>: {issue.message}
            </li>
          ))}
        </ul>
      }
    />
  );
}

/** The theme token map is generated from the record the kind schema declares. */
export function CatalogTokenEditor({
  tokens,
  issues,
  disabled,
  onAdd,
  onChange,
  onRemove,
}: CatalogTokenEditorProps) {
  const tokenIssues = issues.filter((issue) => issue.path.startsWith("definition.tokens"));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Theme tokens</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Every token in the payload is generated here. Values are stored as authored.
        </p>
      </div>
      {Object.keys(tokens).length === 0 ? (
        <p className="text-xs text-text-muted">No tokens declared yet.</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(tokens).map(([tokenKey, value]) => (
            <TokenRow
              key={tokenKey}
              tokenKey={tokenKey}
              value={value}
              disabled={disabled}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      <TokenAddRow tokens={tokens} disabled={disabled} onAdd={onAdd} />
      <TokenIssues issues={tokenIssues} />
    </div>
  );
}