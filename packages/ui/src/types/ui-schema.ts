import type React from "react";

// ==========================================
// 1. NAVIGATION SCHEMA CONTRACTS (ISP)
// ==========================================

export interface NavItemIdentity {
  id: string;
  name: string;
  href: string;
  icon: string;
}

export interface NavItemPresentation {
  badge?: string;
  description?: string;
  isBottomPinned?: boolean;
}

export interface NavItemAuthorization {
  permission?: string;
}

export interface NavItemHierarchy {
  children?: NavItemConfig[];
}

export interface NavItemConfig
  extends NavItemIdentity,
    NavItemPresentation,
    NavItemAuthorization,
    NavItemHierarchy {}

export interface NavigationConfig {
  topItems: NavItemConfig[];
  bottomItems: NavItemConfig[];
}

// ==========================================
// 2. FORM FIELD SCHEMA CONTRACTS (ISP & SRP)
// ==========================================

export type StandardFormFieldType =
  | "text"
  | "number"
  | "switch"
  | "textarea"
  | "password"
  | "custom";

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FieldIdentity<T extends object> {
  name: keyof T & string;
  label: string;
}

export interface FieldPresentation {
  placeholder?: string;
  description?: string;
}

export interface FieldLayout {
  colSpan?: 1 | 2;
}

export interface FieldConstraints<T extends object> {
  required?: boolean;
  defaultValue?: unknown;
  disabled?: boolean | ((values: T) => boolean);
}

export interface FieldAuthorization {
  permission?: string;
}

export interface FieldSelectOptions {
  options: FormFieldOption[];
}

export interface BaseFormFieldConfig<T extends object>
  extends FieldIdentity<T>,
    FieldPresentation,
    FieldLayout,
    FieldConstraints<T>,
    FieldAuthorization {}

export interface StandardFormFieldConfig<T extends object = Record<string, unknown>>
  extends BaseFormFieldConfig<T> {
  type: StandardFormFieldType;
}

export interface SelectFormFieldConfig<T extends object = Record<string, unknown>>
  extends BaseFormFieldConfig<T>,
    FieldSelectOptions {
  type: "select";
}

export type FormFieldType = StandardFormFieldType | "select";

export type FormFieldConfig<T extends object = Record<string, unknown>> =
  | StandardFormFieldConfig<T>
  | SelectFormFieldConfig<T>;

// ==========================================
// 3. FORM CARD SECTION & CONFIG CONTRACTS
// ==========================================

export interface SectionIdentity {
  id: string;
  title: string;
  description?: string;
}

export interface SectionAuthorization {
  permission?: string;
}

export interface StandardFormSection<T extends object = Record<string, unknown>>
  extends SectionIdentity,
    SectionAuthorization {
  isDangerZone?: false;
  dangerConfirmationSlug?: never;
  fields: FormFieldConfig<T>[];
}

export interface DangerZoneFormSection<T extends object = Record<string, unknown>>
  extends SectionIdentity,
    SectionAuthorization {
  isDangerZone: true;
  dangerConfirmationSlug: string;
  fields?: FormFieldConfig<T>[];
}

export type FormCardSection<T extends object = Record<string, unknown>> =
  | StandardFormSection<T>
  | DangerZoneFormSection<T>;

export interface FormStickyActionBarConfig {
  saveLabel?: string;
  discardLabel?: string;
  showDiscard?: boolean;
}

export interface FormConfig<T extends object = Record<string, unknown>> {
  id: string;
  title: string;
  description?: string;
  sections: FormCardSection<T>[];
  stickyActionBar?: FormStickyActionBarConfig;
}

// ==========================================
// 4. TABLE SCHEMA CONTRACTS (ISP)
// ==========================================

export interface ColumnIdentity<T extends object> {
  key: keyof T & string;
  header: string;
}

export interface ColumnPresentation {
  width?: string;
  align?: "left" | "center" | "right";
}

export interface ColumnSorting {
  sortable?: boolean;
}

export interface ColumnCustomRenderer<T extends object> {
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface TableColumnConfig<T extends object = Record<string, unknown>>
  extends ColumnIdentity<T>,
    ColumnPresentation,
    ColumnSorting,
    ColumnCustomRenderer<T> {}

export interface TableActionIdentity<T extends object = Record<string, unknown>> {
  id: string;
  label: string | ((row: T) => string);
  icon?: string;
  tooltip?: string | ((row: T) => string);
}

export interface TableActionPresentation<T extends object = Record<string, unknown>> {
  variant?: "default" | "destructive" | "outline" | "ghost";
  renderIcon?: (row: T) => React.ReactNode;
  iconOnly?: boolean;
}

export interface TableActionAuthorization {
  permission?: string;
}

export interface TableActionHandler<T extends object> {
  onClick: (row: T) => void | Promise<void>;
}

export interface TableActionVerification<T extends object> {
  requiresConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationMessage?: string;
  dangerVerificationSlug?: (row: T) => string;
}

export interface TableActionPredicate<T extends object = Record<string, unknown>> {
  isVisible?: (row: T) => boolean;
}

export interface TableActionConfig<T extends object = Record<string, unknown>>
  extends TableActionIdentity<T>,
    TableActionPresentation<T>,
    TableActionAuthorization,
    TableActionHandler<T>,
    TableActionVerification<T>,
    TableActionPredicate<T> {}

export interface TableEmptyStateConfig {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface TablePaginationConfig {
  pageSize: number;
}

export interface TableConfig<T extends object = Record<string, unknown>> {
  id: string;
  columns: TableColumnConfig<T>[];
  actions?: TableActionConfig<T>[];
  emptyState: TableEmptyStateConfig;
  pagination?: TablePaginationConfig;
}

// ==========================================
// 5. SETTINGS HUB CONFIG CONTRACTS (ISP)
// ==========================================

export interface SubTabIdentity {
  id: string;
  label: string;
  href: string;
}

export interface SubTabAuthorization {
  permission?: string;
  type?: "form" | "table" | "custom";
}

export interface SettingsSubTabConfig extends SubTabIdentity, SubTabAuthorization {}

export interface CategoryIdentity {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
}

export interface CategoryAuthorization {
  permission?: string;
}

export interface CategoryHierarchy {
  subTabs?: SettingsSubTabConfig[];
}

/**
 * Hub configuration contract (DESIGN.md §4.7, AGENTS.md §5 Hub Navigation Law).
 *
 * A category is one routed destination in a secondary navigation panel. It
 * declares its own href, icon key and capability; the hub renders it as a link
 * and never as client state. An item without a permission is a platform anchor
 * that every authenticated operator may see; a gated item fails closed when the
 * permission context is missing or empty.
 */
export interface SettingsCategoryConfig
  extends CategoryIdentity,
    CategoryAuthorization,
    CategoryHierarchy {}

/**
 * A labelled group in the hub panel. Groups render as overlines in declaration
 * order; reading groups first, the Risky/destructive group last. Components
 * never partition groups at runtime or hardcode their labels (H-3.5, H-3.8).
 */
export interface SettingsGroupConfig {
  id: string;
  label?: string;
  items: SettingsCategoryConfig[];
}

/**
 * Modular-app settings registration contract.
 *
 * Every modular app package exports `settingsCategories` with this shape from a
 * pure TypeScript module (no "use client"). The tenant shell resolves the
 * installed apps from `@suite/db` (`InstalledApp`) and mounts only those
 * categories: an uninstalled app contributes no categories and no routes, and
 * adding a category is a config edit inside the app package (H-3.13).
 */
export interface ModularAppSettingsCategories {
  readonly appId: string;
  readonly settingsCategories: readonly SettingsCategoryConfig[];
}

export interface SettingsHubConfig {
  categories: SettingsCategoryConfig[];
  groups?: SettingsGroupConfig[];
}

// ==========================================
// 6. DASHBOARD LAUNCHER & OVERVIEW CONFIG CONTRACTS (ISP)
// ==========================================

export interface AppLauncherItemIdentity {
  id: string;
  title: string;
  href: string;
  icon: string;
}

export interface AppLauncherItemPresentation {
  description: string;
  badge?: string;
  status?: "Available" | "Coming Soon";
  isAvailable?: boolean;
}

export interface AppLauncherItemAuthorization {
  permission?: string;
}

export interface AppLauncherItemConfig
  extends AppLauncherItemIdentity,
    AppLauncherItemPresentation,
    AppLauncherItemAuthorization {}

export interface DashboardOverviewConfig {
  title: string;
  subtitle: string;
  apps?: AppLauncherItemConfig[];
}

