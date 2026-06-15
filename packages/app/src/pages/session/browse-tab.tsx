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
            component={fileComponent}
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
