import type React from "react";

// ==========================================
// 1. NAVIGATION SCHEMA CONTRACTS
// ==========================================

export interface NavItemConfig {
  id: string;
  name: string;
  href: string;
  icon: string;
  badge?: string;
  description?: string;
  permission?: string;
  isBottomPinned?: boolean;
  children?: NavItemConfig[];
}

export interface NavigationConfig {
  topItems: NavItemConfig[];
  bottomItems: NavItemConfig[];
}

// ==========================================
// 2. FORM & CARD SCHEMA CONTRACTS
// ==========================================

export type FormFieldType =
  | "text"
  | "number"
  | "select"
  | "switch"
  | "textarea"
  | "password"
  | "custom";

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldConfig<T = Record<string, unknown>> {
  name: keyof T & string;
  label: string;
  type: FormFieldType;
  description?: string;
  placeholder?: string;
  options?: FormFieldOption[];
  defaultValue?: unknown;
  disabled?: boolean | ((values: T) => boolean);
  required?: boolean;
  colSpan?: 1 | 2;
  permission?: string;
}

export interface FormCardSection<T = Record<string, unknown>> {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldConfig<T>[];
  isDangerZone?: boolean;
  dangerConfirmationSlug?: string;
  permission?: string;
}

export interface FormConfig<T = Record<string, unknown>> {
  id: string;
  title: string;
  description?: string;
  sections: FormCardSection<T>[];
  stickyActionBar?: {
    saveLabel?: string;
    discardLabel?: string;
    showDiscard?: boolean;
  };
}

// ==========================================
// 3. TABLE SCHEMA CONTRACTS
// ==========================================

export interface TableColumnConfig<T = Record<string, unknown>> {
  key: keyof T & string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface TableActionConfig<T = Record<string, unknown>> {
  id: string;
  label: string;
  icon?: string;
  variant?: "default" | "destructive" | "outline" | "ghost";
  permission?: string;
  requiresConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationMessage?: string;
  dangerVerificationSlug?: (row: T) => string;
  onClick: (row: T) => void | Promise<void>;
}

export interface TableConfig<T = Record<string, unknown>> {
  id: string;
  columns: TableColumnConfig<T>[];
  actions?: TableActionConfig<T>[];
  emptyState: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  pagination?: {
    pageSize: number;
  };
}

// ==========================================
// 4. SETTINGS HUB CONFIG CONTRACTS
// ==========================================

export interface SettingsSubTabConfig {
  id: string;
  label: string;
  href: string;
  permission?: string;
  type?: "form" | "table" | "custom";
}

export interface SettingsCategoryConfig {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  permission?: string;
  subTabs?: SettingsSubTabConfig[];
}

export interface SettingsHubConfig {
  categories: SettingsCategoryConfig[];
}
