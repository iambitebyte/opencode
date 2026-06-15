# Session Browse Tab

## Goal

Add a new "浏览" (Browse) tab next to the existing "审查" (Review) tab in the
session page's right-side panel. The Browse tab shows a left-right split: file
tree on the left, read-only file preview (with line numbers and scrollbar) on
the right.

## Non-goals

- No inline comments, no line selection handoff to the prompt, no find-in-file.
  Those features belong to the existing file-tab viewer; Browse is a simple
  viewer.
- No modification of the existing file-tabs row or its state.
- No drag-and-drop reordering, no resizable splitter between tree and preview
  (a fixed split is fine for v1).

## Architecture

### Where it plugs in

`packages/app/src/pages/session/session-side-panel.tsx` already renders a
`<Tabs>` with a `<Tabs.List>` containing the Review tab trigger, optional
Context tab, the sortable per-file tab row, and the `+` button. Below the list,
`<Tabs.Content>` blocks render each tab's body.

We add the Browse tab as a sibling of Review, both in the trigger list and in
the content section. Unlike Review, Browse is always available (no
`canReview()` gate) because every project has a file tree.

### Independent state

The Browse tab owns its own selection signal. Clicking a file in the tree:

1. Sets the local `selectedPath` signal.
2. Calls `file.load(path)` to populate the file context's cache.
3. Re-renders the right pane with the new path.

The existing file-tabs row, the `+` button, and the prompt context are
untouched. Selecting a file in Browse never calls `tabs().open(...)`.

### Components

| Concern | Reused from |
|---|---|
| Recursive file tree | `FileTree` default export, `packages/app/src/components/file-tree.tsx:193` |
| File viewer with line numbers + scrollbar | `File` from `@opencode-ai/ui/file`, used with `mode="text"` |
| File loading + tree data | `useFile()` from `@/context/file` — `file.load(path)`, `file.get(path)`, `file.tree.children(path)` |
| Tab shell | existing `<Tabs.Trigger>` / `<Tabs.Content>` in `session-side-panel.tsx` |
| i18n key | new `session.tab.browse` (zh: "浏览") |

### New files

- `packages/app/src/pages/session/browse-tab.tsx` — exports `BrowseTab`
  component.

### Files modified

- `packages/app/src/pages/session/session-side-panel.tsx` — add Browse tab
  trigger and content. `SessionSidePanel` imports and renders `<BrowseTab />`
  directly inside `<Tabs.Content value="browse">`. No new prop on
  `SessionSidePanel` (Browse has no parent-side state, unlike Review which
  needs `reviewPanel` / `canReview` / `hasReview` / `reviewCount` from the
  parent).
- `packages/app/src/i18n/en.ts` and `packages/app/src/i18n/zh.ts` — add
  `session.tab.browse` and `session.browse.empty`. Other locales fall back to
  English (the i18n system already handles missing keys).

## Component design: `BrowseTab`

```tsx
// packages/app/src/pages/session/browse-tab.tsx

import FileTree from "@/components/file-tree"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { sampledChecksum } from "@opencode-ai/core/util/encode"
import { Dynamic } from "solid-js/web"
import { createSignal, Show, createMemo } from "solid-js"

export function BrowseTab() {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()

  const [selected, setSelected] = createSignal<string | null>(null)

  const state = createMemo(() => {
    const p = selected()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))

  return (
    <div class="flex h-full min-h-0">
      {/* Tree pane — fixed 280px */}
      <div class="w-[280px] shrink-0 overflow-auto border-r border-border-base">
        <FileTree
          path=""
          active={selected() ?? undefined}
          onFileClick={(node) => {
            setSelected(node.path)
            void file.load(node.path)
          }}
        />
      </div>

      {/* Preview pane — fills the rest */}
      <div class="flex-1 min-w-0 overflow-hidden">
        <Show
          when={selected() && contents()}
          fallback={
            <div class="h-full flex items-center justify-center text-text-weak text-14-regular">
              {language.t("session.browse.empty")}
            </div>
          }
        >
          <Dynamic
            component={fileComponent()}
            mode="text"
            file={{
              name: selected()!,
              contents: contents(),
              cacheKey: cacheKey(),
            }}
            media={{
              mode: "auto",
              path: selected()!,
              current: state()?.content,
            }}
            class="select-text"
          />
        </Show>
      </div>
    </div>
  )
}
```

Notes:

- The `<Dynamic component={fileComponent()} ...>` call mirrors
  `FileTabContent` (`packages/app/src/pages/session/file-tabs.tsx:399-439`).
  We omit the comment/selection/search props — Browse is a passive viewer.
  `mode="text"` + `media={{ mode: "auto", ... }}` covers text files, images,
  audio, and SVG.
- `useFileComponent()` is imported from `@opencode-ai/ui/context/file` (same
  import used by `FileTabContent` at `file-tabs.tsx:6`).
- `FileTree` takes `path=""` for the project root. Internally it calls
  `file.tree.children("")` and handles lazy directory expansion.
- `active` highlights the currently-selected file in the tree.

### Empty state

When no file is selected (initial state), the right pane shows a centered
localized hint string (`session.browse.empty`).

## Data flow

```
User clicks file in FileTree
  → onFileClick(node)
  → setSelected(node.path)
  → file.load(node.path) [async, populates file context cache]
  → <File> re-renders with new file prop
  → FileComponent renders content + line numbers
```

No network calls beyond what `file.load` already does (which `FileTabContent`
also uses). No new server endpoints.

## Error handling

- `file.load` failures bubble through `file.get(path).error` (existing). The
  right pane shows the error message in place of the content, same pattern as
  `FileTabContent`.
- Binary/large files: the `File` component already handles virtualization for
  large text files (`VIRTUALIZE_BYTES = 500_000` in `file.tsx`) and falls back
  to `FileMedia` for images. No new logic needed.

## Testing

Manual smoke test (no automated tests in v1 — feature is purely presentational
and reuses battle-tested primitives):

1. Open a session page with a non-empty project.
2. Click the "浏览" tab — should appear next to "审查".
3. Tree pane shows the project's file tree; clicking directories
   expands/collapses.
4. Clicking a code file shows its content with line numbers in the right pane.
5. Clicking a different file updates the right pane; previous selection does
   not leak into the file-tabs row.
6. Resizing the window keeps tree width fixed; preview pane absorbs the delta.
7. Switching to another tab and back to Browse preserves the selected file.

## Resolved decisions

- **Trigger position:** Right of Review. Review stays leftmost because it's
  the more frequently used tab.
- **i18n locales:** Add `session.tab.browse` and `session.browse.empty` to
  `en.ts` and `zh.ts` only. The i18n system falls back to English for other
  locales.
- **Prop shape:** Verified against `file-tabs.tsx:399-439`. See code sample
  above.
