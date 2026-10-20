# ADR-0006: Declarative Config-Driven UI & SOLID Interface Segregation

## Context and Problem Statement
Hardcoding repetitive JSX forms, navigation markup, and settings panels creates massive code sprawl, inconsistent UX layouts, and design token violations across modular applications. Furthermore, monolithic "bag-of-options" TypeScript interfaces with numerous optional properties lead to runtime undefined bugs and defensive code.

## Decision Drivers
- Visual consistency across all screens enforced via `DESIGN.md`.
- Maintenance of Clean Code standards (Single Responsibility Principle, Interface Segregation Principle).
- Single source of truth for navigation, settings, forms, and tables.

## Considered Options
1. Hand-coded bespoke JSX components for every form, settings tab, and navigation menu.
2. Declarative configuration schemas (`*.config.ts`) driving reusable component renderers (`ConfigFormRenderer`, `ConfigTableRenderer`, `SidebarNav`, `SettingsNav`) with discriminated union interfaces.
3. Heavy runtime JSON schema interpretation library (e.g. JSONForms).

## Decision Outcome
Chosen Option: **Option 2**.
- All standard dashboard UI—navigation sidebars, settings tabs, card sections, forms, and data tables—MUST be declarative and driven by strongly-typed configuration schemas.
- Monolithic interfaces stuffed with optional properties are strictly forbidden (Anti-Bag-of-Options Law).
- Payload and prop interfaces MUST use discriminated unions and segregated atomic contracts (`FieldIdentity`, `FieldPresentation`, `FieldConstraints`, `FieldAuthorization`).
- Visual styles must strictly reference semantic design tokens (`text-text`, `bg-surface`, `bg-action`, `border-border`) without hardcoded hex or off-spec color classes.

### Consequences
- **Positive:** Adding new settings fields, navigation entries, or table columns requires only editing configuration objects; 100% compile-time type safety; zero repetitive JSX boilerplate.
- **Negative:** Highly custom interactive surfaces (e.g. Website Builder canvas) must be exempted and designed as bespoke authoring engines.
