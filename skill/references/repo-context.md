# Repo Context for /summon skill

Pre-computed context from devrev-web to speed up audits. Read this before Phase 1.

## Route Map (lib path → product URL)

Derived from `libs/shared/ui-utils/src/router-paths.ts`:

| Lib path prefix | Route | Notes |
|-----------------|-------|-------|
| `libs/accounts/` | `/accounts` | Row click → sidepanel |
| `libs/agent-platform/feature/agent-studio/` | `/settings/agent-studio` | Multi-tab |
| `libs/agent-platform/feature/usage/` | `/settings/usage` | |
| `libs/agent-platform/shared/` | Shared — trace importer | |
| `libs/analytics-framework/` | `/dashboard` or widget contexts | |
| `libs/articles/` | `/knowledge-base/articles` or `/settings/knowledge-base/articles` | |
| `libs/capital-allocation/` | `/settings` (billing area) | |
| `libs/chat-view/` | Inside sidepanel or `/inbox` | |
| `libs/commands/` | Command palette (Cmd+K overlay) | |
| `libs/commerce/` | `/settings/plans` or `/settings/billing` | |
| `libs/connections/` | `/settings/airsyncs` → click connection → sidepanel | |
| `libs/customization-engine/features/cz-admin/` | `/settings/customization` | |
| `libs/customization-engine/features/stage-admin/` | `/settings/customization` → stages tab | |
| `libs/dashboarding/` | `/dashboard` | |
| `libs/datasets/` | `/datasets` | |
| `libs/default-dashboard/` | `/dashboard` (kanban widgets) | |
| `libs/dev-users/` | `/dev-users` | |
| `libs/fields/devrev-common-fields/` | Shared — appears in sidepanels, modals, filters | Trace importer |
| `libs/fields/devrev-module-fields/` | Shared — trace importer | |
| `libs/i18n/` | `/settings/localization` | |
| `libs/imports/feature/airdrop/` | `/settings/airsyncs` → import wizard | |
| `libs/imports/feature/imports/` | `/settings/airsyncs` | |
| `libs/imports/feature/conversational-airdrop/` | `/settings/airsyncs` (connection setup) | |
| `libs/invitations/` | `/settings/members` → invite modal | |
| `libs/jobs/` | Background job banner (any page) | Data-dependent |
| `libs/kanban/` | Any list view with kanban mode | |
| `libs/left-panel/` | Left navigation (always visible) | |
| `libs/links/` | Sidepanel → links tab | |
| `libs/logs/` | `/monitors/logs` or log sidepanel | |
| `libs/marketing/marketplace/` | `/settings/snap-ins` or marketplace pages | |
| `libs/metric-scores/` | Sidepanel metrics section | |
| `libs/micro-apps/identity/login/` | `/login`, `/nux`, `/multi-org-select` | |
| `libs/micro-apps/identity/settings/` | `/settings/*` | |
| `libs/micro-apps/navigation/` | Left nav vistas section | |
| `libs/micro-apps/part/` | `/parts` | |
| `libs/micro-apps/work-v2/` | `/works` | |
| `libs/notifications/` | Updates panel or `/updates` | |
| `libs/parts/feature/part-sidepanel/` | `/parts` → click row → sidepanel | |
| `libs/plug-for-devrev/` | `/settings/plug` or PLuG widget overlay | |
| `libs/preferences/` | Turing/AI preferences panel | |
| `libs/rev-orgs/` | `/customers/orgs` → row click → sidepanel | |
| `libs/rev-users/` | `/contacts` → row click → sidepanel | |
| `libs/security-settings/` | `/settings/security` | |
| `libs/sessions/` | `/web-sessions`, `/mobile-sessions`, `/session-funnels` | |
| `libs/shared/identity/` | Org creation modal | |
| `libs/shared/ui-widgets/` | Shared — sidepanels, field editors | Trace importer |
| `libs/shared-with/` | Sidepanel sharing section | |
| `libs/side-panel/` | Any sidepanel | |
| `libs/slas/` | `/settings/slas` | |
| `libs/snap-ins/` | `/settings/snap-ins` or `/settings/snap-ins/developer-console` | |
| `libs/snapkit/` | Snap-in widget contexts | |
| `libs/support/` | Portal contexts or support fields | |
| `libs/tags/` | Any tag selector (sidepanel, modals) | |
| `libs/teams/` | `/settings/teams` | |
| `libs/telephony/` | Telephony panel (left nav) | Needs active call state |
| `libs/timeline/` | Sidepanel → timeline/comments tab | |
| `libs/traces/` | `/monitors/traces` → click trace → sidepanel | |
| `libs/user-access-mgmt/` | `/settings/roles`, `/settings/groups` | |
| `libs/users/` | User select dropdowns (shared) | |
| `libs/widgets/` | Dashboard widgets, list views | |
| `libs/workflows/` | `/settings/customization/workflows` or workflow canvas | |
| `libs/works/feature/ticket-sidepanel/` | `/works` → click ticket → sidepanel | |

## DS Component Selector Pattern

All raw design system components use `data-drid` attributes:

```
Component source: libs/design-system/shared/raw-design-system/src/components/{name}/{name}.tsx
Theme config: createThemeConfig('{name}', Variants, Modifiers, Slots)
Default drid: data-drid="{name}" (unless overridden by `drid` prop)
```

**Common selectors:**
- Badge: `[data-drid="badge"]`
- Chip: `[data-drid="chip"]`
- Button: `[data-drid="button"]`
- IconButton: `[data-drid="icon-button"]`
- Toggle: `[data-drid="toggle"]`
- Tabs: `[data-drid="tabs"]`
- Modal: `[role="dialog"]` (standard a11y, not drid)
- Tooltip: `[role="tooltip"]`

To find selector for any component: read its `.tsx` source and look for `createThemeConfig('name', ...)` or the `drid` prop default.

## Interaction Patterns

Common UI patterns in devrev-web and how to reach them:

| Pattern | How to trigger | Wait for |
|---------|---------------|----------|
| Sidepanel | Click a row in main list | `[class*="sidepanel"]` visible |
| Sidepanel tab | Inside sidepanel, click tab text | Tab content to render |
| Modal | Click button with specific text | `[role="dialog"]` visible |
| Dropdown/Menu | Click trigger element | `[role="listbox"]` or `[role="menu"]` |
| Command palette | Ctrl+K / Cmd+K | `[class*="command"]` or `[role="dialog"]` |
| Left nav section | Visible by default | Already there |
| Settings sub-page | Navigate to `/settings/X` | Main content loads |
| Filter bar | Usually visible on list pages | Already there |
| Kanban column | Visible on kanban views | Cards rendered |
| Toast/Banner | Triggered by action | `[role="alert"]` or `[class*="toast"]` |

## Feature Flags / Permissions

Some pages require specific permissions or feature flags:
- Commerce/billing pages may be empty without billing admin role
- Telephony requires telephony setup
- Agent Studio requires AI features enabled
- Some badges only render when data exists (counts > 0, active filters, etc.)

Mark these as `"maySkip": true` in manifest.
