# SNR NEST design system

A warm, purposeful workspace: orange leads, charcoal provides structure, and teal
means something has gone well. The authoritative tokens are in
`frontend/src/styles/tokens.css`.

| Color          | Hex       | Purpose                                            |
| -------------- | --------- | -------------------------------------------------- |
| Charcoal Blue  | `#264653` | Headings, sidebar, footer, structure               |
| Sandy Orange   | `#F4A261` | Primary actions, selected navigation, hero accents |
| Jasmine Gold   | `#E9C46A` | Pending work and warm highlights                   |
| Burnt Peach    | `#E76F51` | Decorative coral and exception accents             |
| Verdigris Teal | `#2A9D8F` | Present, approved, completed                       |
| Warm Cream     | `#FFF8F0` | Page background                                    |
| Soft Orange    | `#FFF0DF` | Action surfaces                                    |
| Soft Gold      | `#FFF2D0` | Pending surfaces                                   |
| Soft Coral     | `#FCE5DC` | Exception surfaces                                 |
| White          | `#FFFFFF` | Cards                                              |
| Dark Text      | `#1E2D35` | Body text                                          |

Use dark text on orange/gold buttons; white on brand teal/coral is not assumed to
meet contrast. Derived dark teal/coral text colors support accessible status badges.
Clocked out is a normal completed state. Do not use coral for ordinary completion.

## Typography and composition

Self-hosted **Manrope** headings and **DM Sans** UI/body text, distributed under
the SIL Open Font License through Fontsource. Keep dependency license files.
Manrope is restrained and distinctive; DM Sans has readable open forms. The
fallback stack is system sans-serif. Heading sizes use `clamp`; body text is at
1rem, with compact supplementary labels and table text. Keep paragraph measures near 65ch.

Use generous whitespace, thin warm borders, subtle shadows, 12–20px corners, and
Lucide icons. No excess pills, rainbow cards, fake activity feeds, fake operational
metrics, or technical marketing copy. One original CSS/SVG dashboard composition
provides the homepage illustration, explicitly marked as illustrative.

## Interaction and accessibility

Every control has a label, keyboard focus, and at least a 44px interactive area.
Use semantic landmarks, heading order, native forms, table captions, error messages
linked to fields, a skip link, and focus restoration for dialogs. Orange focus rings
use a dark outline for contrast. Status includes text, never color alone. Dialogs
use the native modal focus trap. Escape closes dialogs and mobile navigation.
Respect `prefers-reduced-motion`. Do not hide information behind hover alone.

## Responsive behavior

Validate at 360, 390, 768, 1024, and 1440px. Public navigation collapses at 768px;
workspace navigation becomes a modal drawer below 1024px. Grids stack; tables
scroll inside named regions without widening the page. Avoid fixed content widths.
WCAG 2.2 AA is the target; automated checks support, but do not certify, compliance.
