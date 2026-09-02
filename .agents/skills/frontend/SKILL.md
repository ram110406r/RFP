---

name: frontend
description: Build and modify the TENDYY frontend using Next.js App Router, React, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide React, TanStack Query, React Hook Form, Zod, and the project's established UI architecture. Use for frontend features, pages, components, forms, dashboards, responsive layouts, client/server components, data fetching, and UI refactoring.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Frontend Engineering Skill

## 1. Mission

Build production-quality frontend experiences for TENDYY.

TENDYY is a tender-response automation platform. The frontend must make complex tender workflows understandable, efficient, auditable, and safe.

Prioritize:

1. Correctness
2. Consistency
3. Usability
4. Accessibility
5. Maintainability
6. Performance
7. Visual quality

Always inspect the existing codebase before implementing a feature.

Do not invent architecture when an existing project pattern already solves the problem.

---

# 2. Technology Stack

Use the project's existing stack.

Primary technologies:

* Next.js App Router
* React
* TypeScript
* Tailwind CSS v4
* shadcn/ui
* Lucide React
* TanStack Query
* React Hook Form
* Zod
* Recharts when data visualization is appropriate

Use the versions already installed in the repository.

Do not introduce another framework or UI library without explicit justification.

Do not install dependencies simply because they are convenient.

---

# 3. Repository First

Before writing code, inspect the repository.

Determine:

* monorepo structure
* frontend application location
* package structure
* existing routes
* layouts
* providers
* components
* hooks
* API clients
* query hooks
* shared types
* authentication
* authorization
* design tokens
* Tailwind configuration
* shadcn configuration
* existing patterns

Search before creating.

Prefer modifying existing architecture over introducing parallel architecture.

---

# 4. Next.js Architecture

Use the App Router.

Prefer Server Components by default.

Use Client Components only when the component requires client-side behavior such as:

* state
* browser APIs
* event handlers
* interactive forms
* TanStack Query
* client-side subscriptions

Do not automatically add:

```tsx
"use client";
```

Every Client Component should have a reason to exist.

Prefer:

```text
Server Component
    ↓
Client Component only where interaction is required
```

Do not move entire pages to the client merely because one section is interactive.

---

# 5. Component Architecture

Build small, composable components.

Prefer components with a single clear responsibility.

Avoid:

* giant components
* deeply nested JSX
* duplicated UI
* excessive prop drilling
* unrelated business logic inside visual components
* unnecessary abstraction

Before creating a component, search for an existing component that can be reused or extended.

Prefer composition over duplication.

---

# 6. Design System

Use the project's existing design system.

Prefer shadcn/ui primitives where applicable:

* Button
* Input
* Textarea
* Select
* Checkbox
* Radio Group
* Switch
* Dialog
* Sheet
* Drawer
* Popover
* Dropdown Menu
* Command
* Tabs
* Card
* Table
* Badge
* Alert
* Tooltip
* Skeleton
* Separator

Use the existing project's variants and styling conventions.

Do not create custom replacements for existing primitives without a clear reason.

---

# 7. Icons

Use Lucide React.

Do not introduce another icon library.

Icon-only controls must have accessible labels.

Example:

```tsx
<Button
  size="icon"
  variant="ghost"
  aria-label="Delete tender"
>
  <Trash2 />
</Button>
```

Do not use emoji as interface icons unless the existing product explicitly uses them.

---

# 8. Tailwind CSS

Use Tailwind CSS v4 according to the project's existing configuration.

Follow existing:

* spacing
* typography
* colors
* radius
* shadows
* borders
* breakpoints
* design tokens

Do not create arbitrary values when an existing token or utility is appropriate.

Avoid enormous unreadable class strings when a component abstraction would improve maintainability.

---

# 9. Responsive Design

Every feature must work across:

* mobile
* tablet
* desktop
* large desktop

Do not design exclusively for a desktop viewport.

Consider responsive behavior for:

* navigation
* sidebar
* tables
* forms
* dialogs
* filters
* toolbars
* dashboards
* cards
* AI review interfaces

For complex tables, intentionally design the mobile experience instead of allowing uncontrolled horizontal overflow.

---

# 10. Accessibility

Accessibility is mandatory.

Use:

* semantic HTML
* labels
* keyboard navigation
* focus states
* appropriate ARIA attributes
* accessible dialogs
* accessible forms
* sufficient contrast
* meaningful error messages

Do not rely exclusively on:

* color
* icons
* hover states

to communicate important information.

Interactive controls must be keyboard accessible.

---

# 11. Forms

Use React Hook Form + Zod for non-trivial forms.

Forms should provide:

* labels
* descriptions where useful
* validation
* useful error messages
* loading state
* disabled state
* success feedback
* failure feedback

Prevent duplicate submissions while a mutation is pending.

Prefer schema-driven validation.

Do not duplicate validation logic unnecessarily between UI components.

---

# 12. Data Fetching

Use TanStack Query according to existing project conventions.

Keep server state separate from local UI state.

Queries should account for:

* loading
* success
* empty
* error

Mutations should account for:

* pending
* success
* error
* cache invalidation/update

Avoid unnecessary refetching.

Do not fetch data repeatedly from individual child components when a parent query or shared query can provide it efficiently.

---

# 13. API Boundary

Frontend components should not contain backend business logic.

Prefer:

```text
UI
 ↓
Query / Mutation Hook
 ↓
API Client
 ↓
Backend
```

Keep API-specific implementation outside presentation components.

Do not directly access the database from frontend code.

Do not expose server secrets.

---

# 14. Loading States

Every asynchronous interface must have an intentional loading state.

Use:

* Skeletons for page/content loading
* Button loading states for mutations
* Suspense where appropriate
* route-level loading states where appropriate

Avoid blank screens.

Avoid excessive spinners when skeletons provide better context.

---

# 15. Empty States

Every collection/list/table should define an intentional empty state.

A useful empty state explains:

1. What is empty
2. Why it may be empty
3. What the user should do next

Example:

```text
No tenders yet

Create your first tender to begin managing
questionnaires and responses.

[Create Tender]
```

Avoid generic:

```text
No data
```

when a more useful explanation is possible.

---

# 16. Error States

Handle errors intentionally.

Consider:

* network failure
* API failure
* validation failure
* authorization failure
* missing resource
* mutation failure
* expired session

Never expose:

* stack traces
* database errors
* internal infrastructure details
* secrets

Give the user an actionable next step where possible.

---

# 17. Authorization UX

Frontend authorization exists for UX.

It does NOT replace backend authorization.

The UI may:

* hide unavailable actions
* disable unavailable actions
* show permission messages
* conditionally render workspace features

But the backend must enforce the actual permission.

Never assume that hiding a button protects a resource.

---

# 18. TENDYY Domain

Use TENDYY's established terminology consistently.

Important domain concepts include:

* Company
* Workspace
* Member
* Tender
* Tender Document
* Questionnaire
* Question
* Answer
* Evidence
* AI Draft
* Risk
* Approval
* Submission
* Activity
* Audit Event

Do not invent alternative names when the domain already defines a term.

---

# 19. Tender UI

Tender interfaces should help users understand:

* tender identity
* customer/buyer
* deadlines
* status
* response progress
* questionnaire progress
* assigned work
* pending approvals
* risks
* evidence
* activity

Prioritize actionable information.

Avoid decorative UI that does not help users complete tender work.

---

# 20. Questionnaire UI

Questionnaire interfaces should make large response sets manageable.

Consider:

* question navigation
* sections
* progress
* answer status
* filters
* search
* assignment
* evidence
* AI-generated drafts
* review status
* approval status
* risk indicators

Users should be able to quickly identify:

* unanswered questions
* low-confidence answers
* answers requiring review
* missing evidence
* approved answers

---

# 21. AI-Generated Content UI

AI-generated content must be distinguishable from finalized human-approved content when that distinction matters.

Where appropriate, display:

* AI draft state
* confidence
* risk
* evidence
* source references
* review state
* approval state
* edit action
* regenerate action

Do not make an AI-generated answer appear automatically authoritative.

Important states may include:

```text
Draft
AI Generated
Needs Review
Approved
Rejected
Final
```

Use the actual product terminology if already defined elsewhere.

---

# 22. Evidence UI

Evidence is a core TENDYY concept.

When displaying evidence, consider showing:

* source document
* relevant excerpt
* source location
* evidence type
* freshness
* relevance
* access permissions

Make evidence easy to inspect without forcing users to leave their current workflow unnecessarily.

---

# 23. Approval UI

Approval workflows should make state and responsibility obvious.

Display:

* current status
* reviewer
* requested action
* reason
* timestamp
* relevant answer/evidence
* approve/reject actions

Avoid ambiguous actions.

Destructive or consequential actions should require appropriate confirmation.

---

# 24. Tables

Use tables for operational datasets.

Consider:

* sorting
* filtering
* pagination
* search
* column visibility
* selection
* bulk actions
* row actions
* loading
* empty
* error

Do not add every table feature automatically.

Only add interactions that help the workflow.

---

# 25. Dashboards

Dashboards should prioritize decisions and actions.

Useful dashboard content may include:

* active tenders
* upcoming deadlines
* response progress
* pending approvals
* high-risk answers
* recent activity
* team workload

Charts should communicate meaningful information.

Use Recharts only where visualization improves comprehension.

Do not create charts merely to make a dashboard look sophisticated.

---

# 26. State Management

Use the simplest appropriate state mechanism.

Distinguish between:

```text
Server State
→ TanStack Query

Form State
→ React Hook Form

Local UI State
→ React state

URL State
→ URL/search parameters where appropriate
```

Do not introduce a global state library unless the existing architecture requires it.

---

# 27. Performance

Avoid:

* unnecessary Client Components
* unnecessary renders
* unnecessary API calls
* huge client-side datasets
* expensive effects
* duplicated queries
* unnecessary dependencies

Use pagination or incremental loading for large collections.

Do not prematurely optimize without evidence.

---

# 28. Security

Never put secrets in frontend code.

Never expose:

* API keys
* private tokens
* database credentials
* service credentials

Assume all browser-delivered code is public.

Do not trust frontend authorization.

Do not render untrusted HTML without appropriate sanitization.

Treat uploaded documents and external content as untrusted.

---

# 29. Code Quality

Prefer clear code over clever code.

Avoid:

* unnecessary abstractions
* magic values
* duplicated constants
* unexplained type assertions
* `any`
* deeply coupled components
* dead code

Use existing project utilities.

If a utility already exists, reuse it.

---

# 30. Implementation Workflow

For every frontend task:

## Step 1 — Understand

Read the relevant existing files.

## Step 2 — Search

Search for:

* similar pages
* similar components
* existing hooks
* existing API calls
* existing types
* existing patterns

## Step 3 — Plan

Identify:

* affected routes
* components
* data requirements
* API requirements
* loading states
* empty states
* error states
* permissions
* responsive behavior

## Step 4 — Implement

Make the smallest clean change that fully solves the task.

## Step 5 — Verify

Run the project's relevant:

* typecheck
* lint
* tests
* build

Use the actual scripts defined by the repository.

## Step 6 — Review

Check:

* functionality
* responsiveness
* accessibility
* loading
* empty state
* error state
* authorization UX
* duplicated code
* unnecessary dependencies
* visual consistency

---

# 31. Do Not

Do not:

* rewrite unrelated code
* change APIs unnecessarily
* install dependencies without justification
* create duplicate components
* bypass the existing design system
* expose secrets
* rely on frontend authorization
* turn everything into Client Components
* ignore loading/error/empty states
* ignore mobile
* fabricate backend data
* silently change domain terminology

---

# 32. Definition of Done

A frontend feature is complete only when:

* functionality works
* existing architecture is respected
* TypeScript passes
* lint passes where applicable
* relevant tests pass
* loading states exist
* empty states exist where relevant
* error states exist
* permissions are handled appropriately
* responsive behavior is considered
* accessibility is considered
* no secrets are exposed
* no unnecessary dependencies were introduced
* implementation matches the existing TENDYY design language
