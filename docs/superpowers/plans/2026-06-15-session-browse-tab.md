# Session Browse Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "浏览" (Browse) tab next to the existing "审查" (Review) tab in the session page's right-side panel, showing a file tree on the left and a read-only file preview (with line numbers) on the right.

**Architecture:** A new `BrowseTab` SolidJS component holds its own selection signal (independent of the existing file-tabs row). It reuses `FileTree` for the left pane and the dynamic `fileComponent` from `useFileComponent()` for the right pane — the same primitive that `FileTabContent` uses, minus the comment/selection/search wiring. The tab is added to `SessionSidePanel` as a sibling of the Review tab.

**Tech Stack:** TypeScript, SolidJS, Tailwind, opencode's existing `@opencode-ai/ui` and `@/context/*` primitives. Build/test via Bun.

**Spec:** `docs/superpowers/specs/2026-06-15-session-browse-tab-design.md`

**Testing strategy:** No automated tests in v1 (per spec — the feature is purely presentational and reuses battle-tested primitives). Verification is manual smoke testing plus a typecheck after each task.

---

### Task 1: Add i18n keys (English + Chinese)

**Files:**
- Modify: `packages/app/src/i18n/en.ts:598` (insert after `session.tab.context`)
- Modify: `packages/app/src/i18n/zh.ts:514` (insert after `session.tab.context`)

The existing `i18n/parity.test.ts` only checks two specific keys (`command.session.previous.unseen` / `command.session.next.unseen`), so adding keys to en + zh only does NOT break parity. Other locales fall back to English at runtime.

- [ ] **Step 1: Add keys to English**

In `packages/app/src/i18n/en.ts`, find the block:

```ts
  "session.tab.session": "Session",
  "session.tab.review": "Review",
  "session.tab.context": "Context",
```

Insert a new line immediately after `"session.tab.context": "Context",`:

```ts
  "session.tab.browse": "Browse",
```

Then find:

```ts
  "session.files.selectToOpen": "Select a file to open",
```

Insert immediately before it:

```ts
  "session.browse.empty": "Select a file to preview",
```

- [ ] **Step 2: Add keys to Chinese**

In `packages/app/src/i18n/zh.ts`, find the block:

```ts
  "session.tab.session": "会话",
  "session.tab.review": "审查",
  "session.tab.context": "上下文",
```

Insert a new line immediately after `"session.tab.context": "上下文",`:

```ts
  "session.tab.browse": "浏览",
```

Then find:

```ts
  "session.files.selectToOpen": "选择要打开的文件",
```

Insert immediately before it:

```ts
  "session.browse.empty": "选择一个文件进行预览",
```

- [ ] **Step 3: Verify typecheck still passes**

Run from repo root: `cd packages/app && bun run typecheck`
Expected: exits 0, no errors. (i18n dictionaries are typed as `Record<string, string>`, so adding keys is always valid.)

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/i18n/en.ts packages/app/src/i18n/zh.ts
git commit -m "feat(i18n): add session.tab.browse and session.browse.empty keys"
```

---

### Task 2: Create the `BrowseTab` component

**Files:**
- Create: `packages/app/src/pages/session/browse-tab.tsx`

This is the heart of the feature. It owns the selection signal and renders the two-pane layout.

- [ ] **Step 1: Create the file**

Create `packages/app/src/pages/session/browse-tab.tsx` with the following exact content:

```tsx
import FileTree from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { sampledChecksum } from "@opencode-ai/core/util/encode"
import { Dynamic } from "solid-js/web"
import { createMemo, createSignal, Show } from "solid-js"

export function BrowseTab() {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()

  const [selected, setSelected] = createSignal<string | null>(null)

  const state = createMemo(() => {
    const path = selected()
    if (!path) return
    return file.get(path)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))

  return (
    <div class="flex h-full min-h-0">
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

Notes for the implementer:
- `fileComponent()` returns the dynamic file viewer component (same one used in `file-tabs.tsx:179` and `message-timeline.tsx:256`). It already handles line numbers, virtualization, and media fallback.
- The `file={{ name, contents, cacheKey }}` shape matches `file-tabs.tsx:402-406`. `name` is the full path, `contents` is the file's text.
- `media={{ mode: "auto", ... }}` lets the viewer fall back to `FileMedia` for images/audio/SVG (same shape as `file-tabs.tsx:426-438`, minus the optional handlers).
- We intentionally omit `enableLineSelection`, `commentedLines`, `annotations`, `search`, and the line-selection callbacks — those would tie Browse into the comment and prompt systems, which the spec excludes.
- `FileTree`'s `path=""` argument means "project root" — internally it calls `file.tree.children("")` to resolve the workspace.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/app && bun run typecheck`
Expected: exits 0. If errors appear, common causes:
- `useFileComponent` import path wrong → confirm it's `@opencode-ai/ui/context/file`
- `FileTree` default export missing → confirm the default export exists at `packages/app/src/components/file-tree.tsx:193`
- `file.get(path)` return type mismatch → compare with `file-tabs.tsx:196-200`

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/session/browse-tab.tsx
git commit -m "feat(app): add BrowseTab component (file tree + preview)"
```

---

### Task 3: Wire the Browse tab into `SessionSidePanel`

**Files:**
- Modify: `packages/app/src/pages/session/session-side-panel.tsx` (add import + tab trigger + tab content)

The Browse tab sits to the **right of Review** in the trigger list and uses the same `<Show>` + `<Tabs.Content>` pattern as Review — but ungated (Browse is always available, since every project has a file tree).

- [ ] **Step 1: Add the import**

In `packages/app/src/pages/session/session-side-panel.tsx`, find the existing import block around line 25:

```tsx
import { FileTabContent } from "@/pages/session/file-tabs"
```

Insert immediately after it:

```tsx
import { BrowseTab } from "@/pages/session/browse-tab"
```

- [ ] **Step 2: Add the tab trigger**

In the same file, find the Review tab trigger (around lines 264-273):

```tsx
                        <Show when={reviewTab() && props.canReview()}>
                          <Tabs.Trigger value="review">
                            <div class="flex items-center gap-1.5">
                              <div>{language.t("session.tab.review")}</div>
                              <Show when={props.hasReview()}>
                                <div>{props.reviewCount()}</div>
                              </Show>
                            </div>
                          </Tabs.Trigger>
                        </Show>
```

Insert immediately after the closing `</Show>` of the Review trigger:

```tsx
                        <Tabs.Trigger value="browse">
                          <div>{language.t("session.tab.browse")}</div>
                        </Tabs.Trigger>
```

No `<Show>` gate — Browse is always available.

- [ ] **Step 3: Add the tab content**

In the same file, find the Review tab content block (around lines 328-332):

```tsx
                    <Show when={reviewTab() && props.canReview()}>
                      <Tabs.Content value="review" class="flex flex-col h-full overflow-hidden contain-strict">
                        <Show when={reviewOpen() && activeTab() === "review"}>{props.reviewPanel()}</Show>
                      </Tabs.Content>
                    </Show>
```

Insert immediately after the closing `</Show>` of the Review content:

```tsx
                    <Tabs.Content value="browse" class="flex flex-col h-full overflow-hidden contain-strict">
                      <Show when={activeTab() === "browse"}>
                        <BrowseTab />
                      </Show>
                    </Tabs.Content>
```

Notes for the implementer:
- The `<Show when={activeTab() === "browse"}>` gate matches Review's pattern — it ensures `BrowseTab` only mounts when the user actually switches to it. This preserves Browse's selection signal across tab switches (the signal lives inside `BrowseTab`, and SolidJS keeps component state alive as long as the tab content stays mounted).
- `contain-strict` matches the styling of every other tab content block.

- [ ] **Step 4: Verify typecheck passes**

Run: `cd packages/app && bun run typecheck`
Expected: exits 0. If errors appear, common causes:
- Forgot the `BrowseTab` import → recheck Step 1
- Wrong location of insertion (inside another `<Show>`) → re-read the context lines around 264-273 and 328-332

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/session-side-panel.tsx
git commit -m "feat(app): wire Browse tab into session side panel"
```

---

### Task 4: Manual smoke test

**Files:** (no code changes — verification only)

Per spec, no automated tests for v1. The feature is purely presentational and reuses battle-tested primitives. Verify by running the app and walking through the scenarios below.

- [ ] **Step 1: Start the dev server**

From repo root: `cd packages/app && bun run dev`
Expected: Vite dev server starts, prints a local URL (often `http://localhost:5173` or similar).

If you don't already have an opencode server running, also start one in another terminal per the project's README. The app needs a server to talk to.

- [ ] **Step 2: Open a session page**

Open the printed URL in a browser. Navigate to a project that has files (e.g., `/Users/chen/Development/my-lrc`). Open or create a session.

- [ ] **Step 3: Verify tab trigger**

Expected: In the right-side panel's tab row, "浏览" (or "Browse" if your UI language is English) appears immediately to the right of "审查" / "Review".

- [ ] **Step 4: Verify empty state**

Click the "浏览" tab. Expected: the panel splits into two panes. Left pane shows the project's file tree. Right pane shows a centered hint text "选择一个文件进行预览" (or "Select a file to preview").

- [ ] **Step 5: Verify file preview**

Click a code file (e.g., `main.py`) in the tree. Expected:
- Right pane shows the file's content with **line numbers** on the left gutter.
- Scrollbar appears if the content exceeds the viewport height.
- The selected file is highlighted in the tree.

Click a different file (e.g., `index.html`). Expected: right pane updates to the new file's content. No new tab is created in the tab row above.

- [ ] **Step 6: Verify independence from the file-tabs row**

Click the `+` button (rightmost in the tab row) and open a file via the dialog — e.g., `renderer.js`. Expected: a new tab `renderer.js` appears in the tab row.

Switch back to "浏览". Expected: `BrowseTab` still shows whichever file was last selected in Browse (NOT `renderer.js`). The file-tabs row's selection did not leak into Browse.

- [ ] **Step 7: Verify state persistence across tab switches**

In Browse, select `main.py`. Switch to "审查" (Review). Switch back to "浏览". Expected: Browse still shows `main.py`.

- [ ] **Step 8: Verify media fallback**

If the project contains an image, click it in the tree. Expected: right pane shows the image (via `FileMedia`), not a code view.

If no image is available, this step can be skipped — the media fallback is exercised by existing `FileTabContent` users.

- [ ] **Step 9: Verify window resize**

Resize the browser window. Expected: tree pane width stays fixed at 280px; preview pane absorbs the size delta. No horizontal scrollbar appears at the panel level.

- [ ] **Step 10: Commit final state**

If any step failed, file the findings as a follow-up. If all steps pass, the feature is complete — no commit is needed (Task 3 already committed all code changes).

---

### Task 5: Final verification

**Files:** (no code changes — final CI-style check)

- [ ] **Step 1: Run the full typecheck**

From repo root: `cd packages/app && bun run typecheck`
Expected: exits 0.

- [ ] **Step 2: Run the i18n parity test (sanity check)**

From repo root: `cd packages/app && bun test src/i18n/parity.test.ts`
Expected: 1 test passes. (This confirms we didn't accidentally break parity by touching `en.ts` / `zh.ts`.)

- [ ] **Step 3: Build the app**

From repo root: `cd packages/app && bun run build`
Expected: build completes without errors.

If the build fails, the most common cause is a typo in the new component file or the i18n keys. Re-check Task 2 Step 1 and Task 1.

---

## Summary of changes

| File | Change |
|---|---|
| `packages/app/src/i18n/en.ts` | +2 keys: `session.tab.browse`, `session.browse.empty` |
| `packages/app/src/i18n/zh.ts` | +2 keys: `session.tab.browse`, `session.browse.empty` |
| `packages/app/src/pages/session/browse-tab.tsx` | NEW: `BrowseTab` component |
| `packages/app/src/pages/session/session-side-panel.tsx` | +1 import, +1 tab trigger, +1 tab content block |

No new dependencies. No changes to `session.tsx`, `file-tabs.tsx`, `file-tree.tsx`, or any server-side code.
