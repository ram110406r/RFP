# RFP Navigator

Build the RFP Operating System Frontend

Build a production-quality frontend for a standalone AI-powered RFP Operating System.

This is not a generic dashboard, not a clone of 1up, and not a marketing landing page. It is a serious enterprise SaaS application where teams receive RFPs, analyze requirements, retrieve evidence, generate answers, assign SMEs, review risks, validate the submission, and eventually learn from won/lost outcomes.

The product must feel like a premium, modern SaaS application used by sales, presales, security, engineering, legal, product, and proposal teams.

Design Direction

Use the provided Dribbble reference as the primary visual inspiration:

https://dribbble.com/shots/25821100-Order-SEO-content-optimization-form-for-saas-web-app-dashboard

Do NOT copy the artwork, branding, exact colors, illustrations, or layout pixel-for-pixel.

Instead, take inspiration from these design principles:

Spacious SaaS dashboard

Strong visual hierarchy

Clean two-column layouts

Long-form workflows broken into clear sections

Sticky contextual sidebar

Large readable section titles

Minimal borders

Soft neutral surfaces

Rounded controls

Compact pills/badges

Strong use of whitespace

Clear primary/secondary actions

Calm, professional, premium visual language

Avoid visual clutter

Avoid excessive cards

Avoid "AI slop" aesthetics

Avoid generic purple gradients

Avoid excessive glassmorphism

Avoid oversized illustrations

Avoid unnecessary animations

The reference's sticky-summary approach should influence the RFP workspace: users should always understand the current RFP state, completion, risk, evidence coverage, and pending approvals while working.

Product Name

Use the placeholder product name:

RFP OS

Design the branding so it can easily be renamed later.

Overall Visual Language

Create a light-first enterprise interface.

Base colors:

Background: warm/off-white or extremely light neutral

Surface: white

Primary text: near-black

Secondary text: muted gray

Border: subtle cool gray

Success: muted green

Warning: muted amber

Risk/error: muted red

Accent: sophisticated dark green/teal OR a restrained brand color

Do not make the UI colorful everywhere.

Color should communicate:

status

risk

confidence

completion

attention

Typography:

Use a modern sans-serif

Prefer Inter, Geist, or a similarly clean product font

Strong headings

Compact but highly readable body text

Do not use oversized marketing typography inside the application

Radius:

Use medium rounded corners

Inputs approximately 10–12px

Buttons approximately 10–12px

Larger panels approximately 14–18px

Avoid excessive pill-shaped UI except tags/statuses

Shadows:

Very subtle

Mostly use borders and surface contrast instead of heavy shadows

Technical Frontend Stack

Use:

Next.js

React

TypeScript

Tailwind CSS

shadcn/ui

Lucide icons

TanStack Query

React Hook Form

Zod

Build components in a reusable and composable manner.

Do NOT generate one giant page component.

Use reusable components for:

sidebar

topbar

page headers

status badges

risk badges

confidence indicators

evidence cards

requirement rows

answer editor

review panel

activity timeline

progress indicators

data tables

filters

modals

drawers

command palette

empty states

loading states

skeletons

toasts

confirmation dialogs

Use mock data and local state for now.

Architect the frontend so the mock data can later be replaced by a NestJS API without redesigning the UI.

Application Structure

Create the following main application areas:

Dashboard

RFPs

New RFP

RFP Workspace

Requirements

Knowledge

Evidence

Reviews

Assignments

Validation

Submissions

Analytics

Settings

Global App Shell

Use a desktop-first layout.

Left sidebar:

RFP OS logo/name

Dashboard

RFPs

Knowledge

Reviews

Submissions

Analytics

Settings

Bottom of sidebar:

Organization switcher

User profile

Help/support

Top bar:

Breadcrumb

Search / command palette trigger

Notifications

Organization/user controls

Sidebar should be compact and elegant.

Do not make it visually heavy.

Use icons with labels.

Allow collapsing the sidebar.

1. Dashboard

The dashboard should feel like a real operating console rather than a collection of decorative cards.

Header:

"Good morning, Ram"

Subtitle:

"Here's what's happening across your RFP pipeline."

Primary button:

"+ New RFP"

Top-level metrics:

Active RFPs

Due this week

Awaiting review

High-risk requirements

Submission readiness

Main content:

RFP Pipeline

Show a clean list/table of active RFPs.

Columns:

RFP

Customer

Owner

Progress

Risk

Deadline

Status

Example rows:

ABC Enterprise Platform
Acme Corporation
82%
17 High
24 Sep 2026
In Progress

Global Security Platform RFP
Vertex Systems
64%
8 Medium
29 Sep 2026
Review

Healthcare SaaS Procurement
Northstar Health
41%
3 Critical
02 Oct 2026
Needs Attention

Use subtle status indicators rather than huge colored blocks.

Attention Required

Show a compact activity/action panel:

8 answers awaiting Security review

3 legal questions awaiting approval

12 unsupported answers

7 stale evidence sources

Submission deadline approaching

Recent Activity

Use a clean activity timeline:

Requirement assigned

Answer approved

Evidence updated

SME comment added

Risk escalated

Submission version created

2. New RFP

This page should be heavily inspired by the reference design's long-form order workflow.

Use a centered content area with a two-column layout:

LEFT:
main form

RIGHT:
sticky RFP summary

Do NOT use a multi-step wizard.

Instead create a long-form structured page with sections.

Section 1 — Basic Information

Fields:

RFP Title

Customer

Opportunity

Estimated Contract Value

Submission Deadline

RFP Owner

Collaborators

Section 2 — Upload Documents

Large drag-and-drop upload zone.

Supported formats:

PDF

DOCX

XLSX

PPTX

ZIP

HTML

Show uploaded files below.

Each file row:

document icon

filename

type

size

processing status

remove action

Example:

Security_Requirements.pdf
PDF · 4.8 MB
Ready

Section 3 — Source / Questionnaire

Allow:

upload documents

paste questionnaire URL

add web questionnaire

import questionnaire

Section 4 — Processing Preferences

Options:

Analyze mandatory requirements

Detect security requirements

Detect commercial requirements

Detect compliance requirements

Identify evaluation criteria

Identify submission instructions

Sticky Right Sidebar

Title:

"RFP Summary"

Display:

Customer
Acme Corporation

Documents
6

Estimated Value
$2.4M

Deadline
24 Sep 2026

Owner
Ram Prasanna

Then:

"Ready to analyze?"

Show checklist:

✓ Customer added
✓ Deadline added
✓ Documents uploaded
✓ Owner selected

Primary button:

"Create RFP"

Secondary action:

"Save draft"

The sticky sidebar should remain visible while the user scrolls.

3. RFP Workspace

This is the most important screen.

Use a sophisticated application workspace.

Header:

RFP title

Customer

Deadline

Status

Primary actions:

Review
Export
More

Below header show compact progress information:

82% Complete
282 / 347 requirements
17 High Risk
48 Needs Review

Main workspace layout:

LEFT / MAIN:

Requirement workspace

RIGHT / STICKY:

RFP intelligence summary

Main Requirement Workspace

Top controls:

Search requirements

Filter

Sort

Category

Risk

Status

Owner

Requirement list should feel like an enterprise table but with richer rows.

Each requirement row:

Requirement ID
REQ-104

Requirement title:
"Vendor must support SAML 2.0."

Category:
Security

Mandatory:
Yes

Risk:
Low

Confidence:
97%

Status:
Approved

Owner:
Security

Clicking a requirement opens a detailed side panel or full detail view.

4. Requirement Detail

This should feel like the core "AI workbench".

Header:

REQ-104

Security

Mandatory

Approved

Question:

"Does your platform support SAML 2.0?"

AI Answer

Large answer area with polished editor styling.

Answer:

"Yes, our platform supports SAML 2.0 for enterprise customers..."

Actions:

Edit
Regenerate
Copy

Evidence

Show evidence cards.

Example:

Security Architecture v4

Verified:
14 Aug 2026

Freshness:
12 days

Confidence:
97%

Source:
Security Documentation

Open source

Answer Confidence

Display a restrained horizontal confidence indicator:

97%

Evidence-backed

Risk

LOW

Explain why:

"Requirement is fully supported and backed by current security architecture documentation."

Review

Reviewer:
Security Team

Status:
Approved

Buttons:

Approve
Reject
Request Changes
Assign

Activity

Timeline:

AI generated answer
Security evidence linked
Security reviewer assigned
Answer approved

5. Knowledge

Knowledge should look like an internal company truth system.

Header:

"Knowledge"

Subtitle:

"Manage the sources your RFP responses depend on."

Primary button:

"+ Add Source"

Filters:

All

Product

Security

Legal

Commercial

Compliance

Architecture

Each knowledge source row should show:

Name
Type
Version
Authority
Freshness
Owner
Last verified
Status

Example:

Security Architecture v4
Approved Policy
Authority: High
Verified: 14 Aug 2026
Fresh

Use freshness badges:

Fresh
Aging
Stale
Conflicting

6. Knowledge Detail

Header:

Security Architecture v4

Metadata:

Owner
Version
Last Updated
Last Verified
Expiry
Authority

Sections:

Overview
Claims
Evidence
Version History
Usage

Show:

"Used by 42 RFP answers"

"3 answers will become stale if this source expires."

Include a "Knowledge conflicts" section when conflicts exist.

Example:

Conflict detected

Current SLA:
99.9%

Sales deck:
99.95%

Historical RFP:
99.99%

Recommended authority:
Current SLA

Action:
Review required

7. Reviews

Create a review queue.

Header:

"Review Queue"

Filters:

All
My Reviews
High Risk
Critical
Overdue

Table:

Requirement
RFP
Category
Risk
AI Confidence
Reviewer
Due
Status

Each item should have a strong visual priority hierarchy.

Critical items must be immediately distinguishable but not visually noisy.

8. Review Workspace

Create a side-by-side review interface.

LEFT:

Question
AI answer
Evidence
Risk
Confidence

RIGHT:

Reviewer panel

Actions:

Approve
Edit
Reject
Request Changes
Reassign

Comments area.

Approval history.

This should be optimized for fast review of many requirements.

9. Validation

Create a "Submission Readiness" dashboard.

Large but tasteful readiness indicator:

86%

Ready for submission

Then show validation categories:

Requirement completeness
321 / 347

Mandatory requirements
38 / 42

Evidence-backed
301 / 321

Conflicting claims
7

Human approvals
286 / 321

High-risk unresolved
3

Clicking each category filters the workspace.

Validation Issues

Group into:

Critical
High
Medium
Low

Each issue should provide:

Issue
Affected requirement
Reason
Recommended action

10. Submission

Create a final submission workspace.

Header:

"Submission"

Version selector:

v1
v2
v3

Submission checklist:

✓ Requirements complete
✓ Evidence validated
✓ SME approval
✓ Risk review
✓ Final validation

Generate:

Completed Questionnaire

Executive Summary

Requirement Matrix

Compliance Matrix

Risk Report

Evidence Report

Exceptions

Approval History

Primary button:

"Generate Submission Package"

Secondary:

"Preview"

11. Analytics

Create a polished analytics dashboard.

Metrics:

RFPs completed

Average completion time

AI acceptance rate

Human edit rate

Review turnaround

Evidence coverage

Win rate

Average deal value

Charts:

RFP volume over time
Win/loss trend
Risk distribution
Answer acceptance rate
RFP completion time
SME review performance

Do not overuse charts.

Use simple, professional data visualization.

12. Global Search / Command Palette

Create a command palette.

Keyboard shortcut:

Cmd/Ctrl + K

Search:

RFPs
Requirements
Customers
Knowledge
Answers
Evidence
People

Examples:

"Search SAML"

"Find high-risk RFPs"

"Show unanswered requirements"

"Find stale knowledge"

13. Notifications

Create notification center.

Categories:

Reviews
Assignments
Risks
Deadlines
Knowledge
Submissions

Example:

"Legal review overdue"

"Security evidence expired"

"RFP deadline in 3 days"

14. Settings

Sections:

Profile
Organization
Members
Roles
AI
Knowledge
Integrations
Notifications
Security
API
MCP

MCP section should show:

MCP Server

Status:
Connected

API credentials

Create credential

Scopes:

rfp:read
rfp:analyze
rfp:answer
rfp:evidence
rfp:review

This page is only a frontend representation for now.

Interaction Requirements

The prototype should feel functional.

Implement:

Navigation between pages

Sidebar collapse

Search

Filters

Sorting

Tabs

Modals

Drawers

Upload interactions

Requirement selection

Review actions

Approve/reject flows

Toast notifications

Form validation

Progress updates

Sticky sidebar behavior

Responsive behavior

Use mock data.

No backend integration yet.

Important UX Principles

The user should always know:

"What RFP am I working on?"

"What needs attention?"

"How much is complete?"

"What's risky?"

"What evidence supports this answer?"

"Who needs to review it?"

"Can I submit yet?"

AI must never visually appear to be the unquestioned authority.

Use language such as:

AI Draft
Evidence-backed
Confidence 97%
Requires Security Review
Approved by Security

Risk should be visually stronger than generic status.

Evidence should be visible directly beside answers.

Long RFP workflows should not be hidden behind excessive modal dialogs.

Prefer inline editing, drawers, and side panels.

Use sticky contextual information wherever it reduces cognitive load.

Responsive Design

Desktop is the primary experience.

Support:

1440px

1280px

1024px

tablet

mobile

On smaller widths:

collapse sidebar

turn sticky summary into a bottom sheet/drawer

convert multi-column sections into one column

preserve critical actions

Component Quality

Do not use placeholder-looking components.

Avoid:

default browser inputs

default HTML tables

giant generic cards

excessive borders

excessive shadows

gradients everywhere

stock illustrations

emoji icons

random colors

Use Lucide icons.

Every page should feel like part of the same design system.

Empty States

Create thoughtful empty states.

Examples:

No RFPs yet

"Create your first RFP to start analyzing requirements, finding evidence, and generating responses."

Button:

"Create RFP"

No reviews

"You're all caught up."

No knowledge conflicts

"No conflicts detected."

Loading States

Create skeleton states for:

tables

requirement lists

dashboard metrics

knowledge sources

evidence panels

Error States

Create professional errors with:

clear message

retry

relevant action

Accessibility

Use:

semantic HTML

keyboard navigation

visible focus states

accessible dialogs

accessible labels

sufficient contrast

screen-reader-friendly status indicators

Visual Quality Target

The finished frontend should look like a product that could realistically be shown to:

enterprise customers

sales teams

security teams

proposal teams

CTOs

procurement departments

It should feel closer to:

Linear + Vercel + modern enterprise SaaS

than:

generic admin dashboard + AI chatbot.

The product should feel calm, intelligent, trustworthy, and operational.

Most important:

Design the interface around the RFP workflow, not around generic dashboard components.

The central experience is:

RFP received
→ understand
→ map requirements
→ retrieve evidence
→ generate answer
→ assess risk
→ assign reviewer
→ approve
→ validate
→ submit
→ learn

Make that workflow visually obvious throughout the product.

Deliverable

Generate the complete frontend prototype with:

routes

reusable components

responsive layouts

realistic mock data

functional interactions

polished visual hierarchy

consistent design system

all major screens listed above

Do not build backend logic.

Do not build authentication logic.

Do not build real AI integration.

Do not build real MCP integration.

Build the frontend architecture so those can be connected later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/241a84a7-4786-48db-82e5-23f033b2df5e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
