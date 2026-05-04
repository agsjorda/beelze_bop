# Porting the orientation modal to other games

This guide describes how the **Beelze-Bop** “rotate to portrait” overlay works and how to reuse it in other titles in this monorepo (or elsewhere), accounting for different host shells: **React + Vite**, **Phaser-only**, **iframe embeds**, etc.

The reference implementation lives under `beelze_bop/`:

| Piece | Role |
|--------|------|
| `index.html` | Static `#orientation-modal` markup (above or beside your app root). |
| `public/style.css` | Full-screen overlay, typography, hidden state. |
| `src/orientationModal.ts` | Detection, auto show/hide, keyboard/`inert` guards, `localStorage` overrides, `window` helpers. |
| `src/main.tsx` (or your earliest bootstrap) | Side-effect `import './orientationModal'` so logic runs once. |

---

## What the feature does

1. **Auto-show** a full-screen modal when the page is in **landscape** on a **phone** (heuristic), prompting the user to return to portrait.
2. **Auto-hide** when orientation returns to **portrait**.
3. **Tablets** are treated like **desktop** by default (no auto modal), with an opt-in to phone-style behavior.
4. While visible: **keyboard events** are blocked (capture listeners) and **`#root`** is set **`inert`** where supported, so input does not reach the game shell.
5. **Persistence** (optional overrides): `localStorage` keys for QA / settings (see below).

---

## Architectural patterns

### A. React (or Vue/Svelte) + Vite — game in `#root`

**Matches Beelze-Bop.**

1. Copy **`orientationModal.ts`** into the target project (e.g. `src/orientationModal.ts`).
2. Add the **HTML block** to **`index.html`** (see [Markup template](#markup-template)). Place it as a **sibling** of `#root` (or your mount node), **not** inside the SPA root, so it is not destroyed by React.
3. Merge **[CSS](#css-template)** into your global stylesheet (path may be `public/style.css` or `src/index.css` depending on the template).
4. Import once at bootstrap:

   ```ts
   import './orientationModal';
   ```

   Prefer the **first** module that runs after HTML is parsed (e.g. `main.tsx` / `main.ts` **before** `createRoot`), same as Beelze-Bop.

5. **Z-index**: ensure the modal stacks **above** the game canvas and any non-portal UI. Beelze-Bop uses a large fixed `z-index`; adjust if your shell uses stacking contexts (e.g. modals at `99999`).

### B. Phaser-only (single `index.html`, no React root)

1. Keep the same **HTML** + **CSS**.
2. Import `orientationModal.ts` from your **Phaser entry** (`main.ts` / `game.ts`) **after** you can rely on `document.getElementById('orientation-modal')` existing — i.e. script is **`type="module"`** at end of `<body>` after the modal markup, or wait for `DOMContentLoaded`.
3. Set **`getRoot()`** strategy (see [Adapting `getRoot` and canvas blur](#adapting-getroot-and-canvas-blur)): if you have no `#root`, either add a wrapper `<div id="root">` around the canvas for `inert`, or change the module to call `inert` on `document.getElementById('game-container')` / `body` first child.

### C. Game embedded in an iframe

- The modal must live in the **same document** as the **game** (usually the iframe’s `index.html`). Parent-page overlays do not block input inside the iframe.
- If the **parent** shows a “rotate device” banner instead, that is a separate implementation (parent `postMessage` + child pause), not this module.

### D. Monorepo: another package (e.g. `mars_triumph`, `shuten_doji`)

1. **Copy files**: `orientationModal.ts`, HTML snippet, CSS snippet (or link a **shared** package later if you deduplicate).
2. **Prefix** `localStorage` keys and `window` helper names per game if QA runs multiple builds on one origin and you must avoid collisions (see [Namespacing](#namespacing)).
3. **Assets**: copy `orientation_icon.webp` (or point `src` to a shared CDN / `public/` path consistent with that game’s asset layout).
4. **Fonts**: either load the same `@font-face` as Beelze-Bop (`main.scss` / `style.css`) or change the modal copy rules to your title’s font stack.

### E. SSR / Next.js / Nuxt

- Do **not** reference `window` / `document` at **import** top-level outside guards. Wrap listener registration in `if (typeof window !== 'undefined')` or only `import` the module from a **client-only** entry (`'use client'` layout, `onMounted`, etc.).
- Static modal markup may need to live in a **root layout** component instead of `index.html`; ensure the element **`id="orientation-modal"`** (or update `MODAL_ID` in TS to match).

---

## Markup template

Place **after** your app mount container so the modal is a direct child of `<body>` (or inside a static shell you never unmount):

```html
<div id="orientation-modal" class="orientation-modal orientation-modal--hidden" aria-hidden="true">
  <img
    class="orientation-modal__icon"
    src="/assets/portrait/high/loading/orientation_icon.webp"
    alt="Rotate your device"
    draggable="false"
  />
  <div class="orientation-modal__copy">
    <p>Please switch back to <strong>Portrait mode</strong></p>
    <p>to continue the game.</p>
  </div>
</div>
```

- Adjust **`src`** to each game’s public URL (Vite: files under `public/` are served from `/`).
- Localize copy per SKU if required.

---

## CSS template

Minimal contract with the TypeScript:

- **`#orientation-modal`**: `position: fixed; inset: 0;` flex column, centered content, semi-transparent background (e.g. `rgba(0,0,0,0.7)` — tune per art direction).
- **`#orientation-modal.orientation-modal--hidden`**: `display: none;`.
- **`.orientation-modal__icon`**: `pointer-events: none` so clicks hit the overlay (for future dismiss behavior if you add it).
- **`.orientation-modal__copy`**: `text-align: center`, same `pointer-events: none` pattern.

Copy the full rules from `beelze_bop/public/style.css` under the `#orientation-modal` section and merge into the target project’s global CSS.

---

## TypeScript module (`orientationModal.ts`)

### Responsibilities

| Concern | Implementation notes |
|--------|-------------------------|
| Show / hide | Toggle class `orientation-modal--hidden` on `#orientation-modal`; set `aria-hidden`. |
| Auto sync | `matchMedia('(orientation: landscape)')`, `resize`, `orientationchange`, `visualViewport.resize`. |
| Handheld detection | `isHandheldFormFactor()` — UA + `maxTouchPoints` + `(pointer: coarse)`. |
| Tablet vs phone | `isLikelyTablet()` — iPad, Android heuristics, etc. Tablets skip auto modal unless `bb_force_phone_ui`. |
| Overrides | `localStorage`: `bb_force_desktop_behavior`, `bb_force_phone_ui`. |
| Keyboard | Capture-phase `keydown` / `keyup` / `keypress` + `#root` `inert` while open. |
| Devtools | `window.showOrientationModal`, `hideOrientationModal`, `bbSetDesktopUi`, `bbSetPhoneUi`. |

### Adapting `getRoot` and canvas blur

Beelze-Bop uses:

```ts
function getRoot(): HTMLElement | null {
  return document.getElementById('root');
}
```

and blurs `#game-container canvas`.

For another game:

| Your shell | Change |
|------------|--------|
| Mount id is `#app` not `#root` | Point `inert` at `#app` or wrap the game in a dedicated `#game-shell` with a stable id. |
| No single root | Set `inert` on the **parent of the canvas** you want unfocusable, or skip `inert` and rely only on keyboard capture (weaker for focusable controls). |
| Canvas selector differs | Update the `querySelector` in `blurGameFocus()` (e.g. `#phaser-game canvas`). |

Keep **`getModal()`** aligned with HTML: if you rename the id, update `MODAL_ID` at the top of the module.

### Namespacing

If several games share one **origin** (same `localStorage`), prefix keys and window helpers per title, e.g.:

- `mars_force_desktop_behavior`
- `window.marsSetDesktopUi`

and rename exports accordingly to avoid cross-game leakage.

---

## `localStorage` — why it exists

Overrides are **optional** and **persistent**:

- **`bb_force_desktop_behavior`**: never auto-open the modal (useful for QA on a real phone).
- **`bb_force_phone_ui`**: on tablets classified by heuristic, opt into the same auto modal as phones.

If your architecture prefers **server-backed user settings** or **session-only** flags, replace `localStorage` reads/writes with your API and call the same **`syncAutoOrientationModal()`** (or equivalent) after the preference resolves.

---

## Console helpers (after port)

| Call | Effect |
|------|--------|
| `showOrientationModal()` | Force show (manual test). |
| `hideOrientationModal()` | Force hide. |
| `bbSetDesktopUi(true)` | Disable auto modal on all devices until cleared. |
| `bbSetPhoneUi(true)` | Tablet: enable phone-style auto modal. |

---

## Verification checklist

- [ ] Rotate a **physical phone**: modal appears in landscape, hides in portrait.
- [ ] **iPad** / Android **tablet**: modal **does not** auto-open in landscape unless `bbSetPhoneUi(true)`.
- [ ] With modal open: **no** game taps / keys reach the canvas (spot-check Phaser buttons / React overlay if any).
- [ ] `bbSetDesktopUi(true)` then rotate phone: modal **stays off**; `bbSetDesktopUi(false)` restores.
- [ ] **Z-order**: modal covers loading spinners, fullscreen toggles, etc., or lower modal `z-index` intentionally if a legal/debug HUD must stay on top.
- [ ] **i18n**: strings and `alt` text updated for locale.
- [ ] **Build**: `public/` asset paths correct for **production** `base` URL (Vite `import.meta.env.BASE_URL` if you ever move the icon path into TS).

---

## Optional integrations

- **ScreenModeManager** (or equivalent): emit an event when the modal opens/closes if other systems (analytics, pause) must react.
- **Phaser**: pause scenes when modal visible if you need audio/input fully frozen beyond DOM guards.
- **Accessibility**: consider `role="dialog"`, `aria-modal="true"`, and a focus trap if you add a dismiss button later.

---

## Reference paths (Beelze-Bop)

- `beelze_bop/index.html` — `#orientation-modal` markup  
- `beelze_bop/public/style.css` — `#orientation-modal` rules  
- `beelze_bop/src/orientationModal.ts` — logic  
- `beelze_bop/src/main.tsx` — `import './orientationModal'`

When in doubt, port **HTML + CSS + TS + one bootstrap import** together; partial ports (TS without DOM or CSS without `#orientation-modal`) will fail silently or throw on `getModal()`.
