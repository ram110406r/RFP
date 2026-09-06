# TENDYY Responsive Route Audit

Breakpoints: mobile below 768px, tablet 768px to 1279px, desktop 1280px and above.

| Route or surface | Initial overflow source | Severity | Correction | Status |
| --- | --- | --- | --- | --- |
| Global shell | `overflow-x: hidden` masked structural defects; shell children could resist shrinking | Critical | Removed masking and added `min-width: 0`, bounded content, viewport padding, and media constraints | Fixed |
| Mobile navigation | Drawer width, background scrolling, and keyboard focus | High | Viewport gutter, body scroll lock, focus trap, Escape close, and focus restoration | Fixed |
| `/tenders` | Dense rows, advanced filters, tabs, and fixed detail rail | Critical | Mobile result cards, filter sheet, responsive navigation, wrapped controls, and viewport-safe detail rail | Fixed |
| `/tenders/[id]` and requirement detail | Two-column workbench and long document/requirement content | High | Progressive grids, wrapping content, vertically scrolling viewer, and stacked actions | Fixed |
| `/apply` and `/apply/[id]` | Eight-column application table and automation workbench | Critical | Desktop table plus card records below 1280px; progressive automation grids and wrapped evidence/candidate text | Fixed |
| `/requirements`, `/responses`, `/reviews`, `/submissions` | Fixed-minimum-width operational tables | Critical | Desktop table plus complete mobile/tablet card representation | Fixed |
| `/pipeline` | Horizontally scrolling stage board and fixed columns | Critical | Stage summary, selected-stage list, vertical lifecycle timeline, responsive cards, and focus-trapped detail sheet | Fixed |
| Dashboard and `/workspace` | Wide bento rows, pipeline strip, and member/activity tables | High | Progressive bento grids, stage summary grid, fluid desktop tables, and cards below 1280px | Fixed |
| `/analytics` | Dense readiness rows and multi-column metrics | Medium | Parent-driven bars and progressive one/two/four-column layout | Fixed |
| `/knowledge/**` | Wide tabs and metadata/usage tables | High | Mobile section selector, wrapping navigation, desktop tables with complete card alternatives, and wrapped source content | Fixed |
| `/organization`, `/settings`, `/profile` | Long category tabs, fixed-width tables, dialogs, IDs, and emails | High | Mobile category selectors, fluid desktop tables, card records, viewport-bounded dialogs, and long-content wrapping | Fixed |
| `/settings/tender-sources` | Six-column grid activated at tablet width | High | Card grid through tablet and operational columns only at desktop | Fixed |
| `/access`, `/audits`, `/notifications`, `/templates` | Action groups and long record metadata | Medium | Wrapping rows and card-oriented records | Fixed |
| Login, signup, join, onboarding, import, new tender | Multi-column forms and long validation messages | High | Single-column mobile forms, bounded controls, progressive grids, and wrapping messages/actions | Fixed |

## Intentional Component Scrolling

Only `pre` elements may scroll horizontally because preformatted source or code is intrinsically comparative. Document content, URLs, filenames, IDs, emails, requirements, answers, tables, tabs, navigation, filters, and pipeline stages wrap or switch representation instead.

The executable matrix is in `e2e/responsive.spec.ts` and covers widths 390, 414, 768, 1024, 1280, and 1440. Dynamic workspace routes use seeded IDs supplied through Playwright environment variables.
