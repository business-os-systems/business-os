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

export interface SettingsCategoryConfig
  extends CategoryIdentity,
    CategoryAuthorization,
    CategoryHierarchy {}

export interface SettingsGroupConfig {
  id: string;
  label?: string;
  items: SettingsCategoryConfig[];
}

export interface SettingsHubConfig {
  categories: SettingsCategoryConfig[];
  groups?: SettingsGroupConfig[];
}
