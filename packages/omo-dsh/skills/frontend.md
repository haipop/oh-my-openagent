# Frontend

Use this directive when the task involves a page, component, layout, styling, animation, or any
request to make an interface look or feel a particular way.

The bar is not clean and correct. It is work a senior product designer at a serious software company
would ship. Correct but flat is a failure. Design is a deliverable, not decoration.

## Phase 0: Route

Name the concerns the request touches before opening any file, and read the matching evidence before
writing code:

| Request involves | What to settle first |
|---|---|
| Visual quality, polish, "make it look good" | Existing tokens, type scale, spacing rhythm, component states, reference screenshots |
| New layout or responsive behavior | Breakpoints, container queries, content priority, empty and loading states |
| Motion or interaction | What the motion communicates, duration and easing scale, reduced-motion fallback |
| Accessibility or semantics | Landmarks, labels, focus order, contrast, keyboard paths |
| Design system work | Token names and layers, component API, documentation surface |

An unnamed concern is a decision made by accident. Write the routed list in the response, then work.

## Foundations

- Use the project's existing tokens for color, spacing, radius, shadow, and type. Introduce a token
  only when a second consumer exists.
- Type: keep a small scale, set line height with size, cap line length near 65 characters for prose,
  and make hierarchy by weight and size together, not by color noise.
- Spacing: one rhythm (4 or 8 based). Align to it; inconsistent spacing is the most common slop.
- Color: one accent, neutrals for structure, semantic colors only for state. Check contrast for text
  and focus rings against the real background, including dark mode.
- Layout: content-first. Prefer `grid`/`flex` with intrinsic sizing over fixed pixel choreography.

## Component Contract

Every interactive component defines its states: default, hover, focus-visible, active, disabled,
loading, error, empty. Missing states are the difference between a prototype and a product.

- Focus is visible, high-contrast, and never removed without a replacement.
- Loading is a skeleton or progress indicator that preserves layout; no spinner that shifts content.
- Error states say what happened and what to do next, in the user's language.
- Empty states explain the surface and offer the first action.

## Motion

Motion communicates cause and effect: entry, exit, expansion, state change. Keep one duration scale
and one easing family. Animate transform and opacity; avoid layout-thrashing properties. Respect
`prefers-reduced-motion`. If a motion does not communicate something, delete it.

## Anti-Slop List

- Three-line hero gradients, glassmorphism without purpose, decorative blur over content.
- Generic card grids with no hierarchy, every card the same weight.
- Emoji as icons, icon sets mixed at random, misaligned icon text.
- Placeholder copy left in place, lorem ipsum, "Your text here".
- Inconsistent radii and shadows invented per component.
- Purple-to-blue gradient buttons that fight the brand accent.
- A "modern" layout that breaks at 320px or 1440px.

## Verification

1. Build and typecheck the project with its own commands.
2. Exercise the real surface: open the page, resize to narrow, wide, and mid widths, tab through the
   keyboard path, check focus and disabled states.
3. When a browser tool or screenshot capability is available, capture the states and compare them
   against the routed design intent; state what changed from the capture.
4. Report the routed concerns, files changed, states verified, and any gap you could not observe.
