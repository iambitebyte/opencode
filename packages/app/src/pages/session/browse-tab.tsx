import FileTree from "@/components/file-tree"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { sampledChecksum } from "@opencode-ai/core/util/encode"
import { Dynamic } from "solid-js/web"
import { createMemo, Show } from "solid-js"

export function BrowseTab(props: {
  selected: () => string | null
  setSelected: (path: string | null) => void
}) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()

  const state = createMemo(() => {
    const path = props.selected()
    if (!path) return
    return file.get(path)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))

  return (
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <div class="w-[280px] shrink-0 overflow-auto border-r border-border-base">
        <FileTree
          path=""
          active={props.selected() ?? undefined}
          onFileClick={(node) => {
            props.setSelected(node.path)
            void file.load(node.path)
          }}
        />
      </div>

      <div class="flex-1 min-w-0 overflow-hidden">
        <Show
          when={props.selected() && contents()}
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
              name: props.selected()!,
              contents: contents(),
              cacheKey: cacheKey(),
            }}
            media={{
              mode: "auto",
              path: props.selected()!,
              current: state()?.content,
            }}
            class="select-text"
          />
        </Show>
      </div>
    </div>
  )
}
