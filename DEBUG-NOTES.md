# OpenCode Web 调试笔记

## 架构关系

Web 前端（`packages/app`）通过 SDK 调用后端 HTTP 服务，默认连接 `http://localhost:4096`。前端本身不访问文件系统，所有目录/文件操作都走后端 API。

- 前端 server URL 解析：`packages/app/src/entry.tsx`
- SDK 客户端创建：`packages/app/src/utils/server.ts`
- 后端 server 入口：`packages/opencode/src/server/server.ts`

## 启动方式

### 方式一：单独跑前端 dev server（调试 UI 用）

需要两个终端：

```bash
# 终端 1：启动后端
bun run --cwd packages/opencode --conditions=browser src/index.ts serve

# 终端 2：启动前端（实际跑 packages/app）
bun run dev:web
```

后端不在默认 `localhost:4096` 时，可用环境变量：

```bash
VITE_OPENCODE_SERVER_HOST=127.0.0.1 VITE_OPENCODE_SERVER_PORT=4096 bun run dev:web
```

### 方式二：web 子命令（开箱即用）

```bash
bun run --cwd packages/opencode --conditions=browser src/index.ts web
```

同时启动后端 + 自动打开浏览器。但前端代码没有热重载，不适合调 UI。

## 开启后端日志

默认后端把日志吞了，调试时需要手动开启。

文件：`packages/opencode/src/server/server.ts` 第 103 行

```ts
disableLogger: false,  // 原来是 true
```

改完**必须重启 serve**——Bun 不热重载 TS 源码。在 serve 终端按 `Ctrl+C` 后重跑启动命令。

## 测试后端 API

直接用 curl，绕过前端排查问题：

```bash
# 查看后端项目上下文（cwd、worktree 等）
curl -s 'http://127.0.0.1:4096/path' | python3 -m json.tool

# 测试目录浏览（directory 用 URL 编码的绝对路径）
curl -s 'http://127.0.0.1:4096/find/file?directory=/Users/chen/Development/opencode&query=&type=directory&limit=50' | python3 -m json.tool

# 列出 sessions
curl -s 'http://127.0.0.1:4096/session' | python3 -m json.tool
```

500 错误返回的 JSON 带 `ref` 字段（如 `err_b3d6f1dc`），可以在后端日志里搜这个 ref 定位具体堆栈。

## 常见问题

### "未找到文件夹" / Web 端打不开项目

1. **后端没启动**：检查 `curl http://127.0.0.1:4096/path` 能不能通
2. **端口不对**：前端默认连 4096，确认后端监听的端口
3. **`bun run dev` ≠ 启动 server**：`bun run dev` 启动的是 TUI 模式，不是 HTTP 服务。要调 Web 必须用 `serve` 或 `web` 子命令

### `/find/file` 返回 500

- 开启日志（见上）后看后端报什么
- 常见原因：项目实例初始化失败。`/find/file` 在 `InstanceHttpApi` 下，需要一个有效项目实例
- 非 git 目录首次访问可能 500，重启 serve 后通常能恢复（`Project.resolve` 对非 git 目录会返回 global 项目）

### 桌面端 vs Web 端目录选择差异

- **桌面端**：用系统原生文件选择器（`platform.openDirectoryPickerDialog`），不走后端 API
- **Web 端**：用 `DialogSelectDirectory` 组件，调后端 `/find/file`，受限于后端项目实例机制

逻辑在：`packages/app/src/components/directory-picker-policy.ts`

## 关键文件速查

| 文件 | 作用 |
|------|------|
| `packages/opencode/src/server/server.ts` | 后端 server 启动、`disableLogger` 开关 |
| `packages/opencode/src/cli/cmd/serve.ts` | `serve` 子命令 |
| `packages/opencode/src/cli/cmd/web.ts` | `web` 子命令 |
| `packages/app/src/entry.tsx` | 前端解析后端 URL |
| `packages/app/src/utils/server.ts` | 前端创建 SDK 客户端 |
| `packages/app/src/context/server-sdk.tsx` | 前端 SDK 上下文 |
| `packages/app/src/components/dialog-select-directory.tsx` | Web 端目录选择对话框 |
| `packages/app/src/pages/home.tsx` | 首页，项目列、添加项目按钮 |
| `packages/sdk/js/src/v2/client.ts` | SDK 客户端，`directory` 参数注入逻辑 |
| `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts` | 工作目录解析，`OPENCODE_FIXED_DIRECTORY` 锁定点 |
| `packages/opencode/src/server/routes/instance/httpapi/middleware/error.ts` | 500 错误包装，生成 `ref` |
| `packages/opencode/src/project/project.ts` | `Project.fromDirectory` 项目解析 |
| `packages/core/src/project.ts` | `Project.resolve`，非 git 目录返回 global |

## 自定义改动汇总

为了把 OpenCode 锁定到一个固定工作目录（不希望用户自由浏览 `~`），对源码做了如下改动。所有改动都向后兼容——不设置环境变量时行为与原版一致。

### 改动 1：开启后端日志

**文件**：`packages/opencode/src/server/server.ts` 第 103 行

```diff
-    disableLogger: true,
+    disableLogger: false,
```

**原因**：默认后端吞掉所有日志，500 错误只返回一个 `ref`，调试时无法定位根因。开启后请求日志和错误堆栈都会打到 serve 终端。

**注意**：这是开发期改动，不需要任何环境变量触发，直接生效。生产环境记得改回 `true`。

---

### 改动 2：后端限定工作目录根（允许访问子目录）

**文件**：`packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts` 第 86-103 行

```diff
 function defaultDirectory(request: HttpServerRequest.HttpServerRequest, url: URL): string {
-  if (process.env.OPENCODE_FIXED_DIRECTORY) return process.env.OPENCODE_FIXED_DIRECTORY
+  const fixed = process.env.OPENCODE_FIXED_DIRECTORY
+  if (fixed) {
+    const requested = url.searchParams.get("directory") || (request.headers["x-opencode-directory"] as string | undefined)
+    if (requested && isWithinFixedDirectory(requested, fixed)) return requested
+    return fixed
+  }
   return url.searchParams.get("directory") || request.headers["x-opencode-directory"] || process.cwd()
 }
+
+function isWithinFixedDirectory(target: string, fixed: string): boolean {
+  const normalize = (p: string) => p.replace(/[\\/]+$/, "")
+  const a = normalize(target)
+  const b = normalize(fixed)
+  if (a === b) return true
+  const sep = target.includes("/") ? "/" : "\\"
+  return a.startsWith(b + sep)
+}
```

**原因**：早期版本是"硬锁"——设置 `OPENCODE_FIXED_DIRECTORY` 后忽略所有 `directory` 参数，统一返回锁定路径。这导致无法在锁定目录下切换/浏览子目录（例如锁定 `/Users/chen/Development` 后，无法打开其中的 `opencode` 子项目）。

**当前行为**：把 `OPENCODE_FIXED_DIRECTORY` 当作"目录根围栏"——
- 请求未指定 `directory`：返回 fixed
- 请求指定了 `directory` 且**落在 fixed 内**（含 fixed 自身、其子目录）：返回请求的目录
- 请求指定了 `directory` 但**逃出 fixed**：忽略请求，返回 fixed（兜底保护）

围栏判定由 `isWithinFixedDirectory` 完成，对路径分隔符 `/` 和 `\` 都兼容（Windows 友好），并去掉尾部斜杠避免 `Development/` 和 `Development` 不一致。

**用法**：

```bash
OPENCODE_FIXED_DIRECTORY=/Users/chen/Development \
  bun run --cwd packages/opencode --conditions=browser src/index.ts serve
```

**联动效果**：`/path` 接口返回的 `directory` 字段会落在 `[fixed, fixed/...]` 区间内（因为 InstanceContext 用同一个目录），前端据此显示。前端目录选择对话框从 fixed 根开始浏览，用户可以下钻到子项目。

---

### 改动 3：目录选择对话框从锁定目录开始浏览

**文件**：`packages/app/src/components/dialog-select-directory.tsx` 第 267-269 行

```diff
   const start = createMemo(
-    () => sync.data.path.home || sync.data.path.directory || fallbackPath()?.home || fallbackPath()?.directory,
+    () => sync.data.path.directory || sync.data.path.home || fallbackPath()?.directory || fallbackPath?.home,
   )
```

**原因**：原来 `start` 优先用 `home`（即 `~`），所以打开目录选择对话框总是从家目录开始。改为优先 `directory`，配合后端 `OPENCODE_FIXED_DIRECTORY` 后，对话框从锁定目录开始浏览。`home` 仍保留用于波浪号显示，不受影响。

---

### 改动 4：隐藏"添加项目"按钮，改为显示固定目录路径

**文件**：`packages/app/src/pages/home.tsx`

**思路**：锁定目录后，"添加项目"（浏览其他目录）的功能就没意义了，把图标按钮换成固定目录路径的文本展示。

**具体改动**：

1. `HomeProjectColumn` 新增 `directory?: string` prop，原"添加项目" `IconButtonV2` 替换为目录路径展示（等宽字体、灰色、最大宽度 180px 自动截断、`title` 显示完整路径）。
2. `HomeServerRow`（多服务器场景）里的"添加项目"按钮整段删除。
3. `HomeDesign` 把 `sync.data.path.directory` 透传给 `HomeProjectColumn`。

```tsx
// HomeProjectColumn 里的替换
<Show when={props.directory}>
  {(dir) => (
    <div class="text-12-mono text-v2-text-text-muted truncate max-w-[180px]" title={dir()}>
      {dir()}
    </div>
  )}
</Show>
```

---

## 启动流程（带锁定目录）

完整调试启动命令：

```bash
# 终端 1：启动后端（锁定到 /Users/chen/Development）
OPENCODE_FIXED_DIRECTORY=/Users/chen/Development \
  bun run --cwd packages/opencode --conditions=browser src/index.ts serve

# 终端 2：启动前端 dev server
bun run dev:web
```

注意：
- 后端改动（改动 1、2）需要重启 `serve` 才生效，Bun 不热重载 TS
- 前端改动（改动 3、4）Vite 会热重载，浏览器自动刷新即可

## 单进程单端口部署（生产模式）

把前端打包进后端，单进程跑在 `http://127.0.0.1:4096`，不再需要 Vite dev server。

### 改动 5：新增 web UI 构建脚本

**文件**：`packages/opencode/script/build-web.ts`（新文件）

**作用**：
1. 调用 `packages/app` 的 vite build，产出 `packages/app/dist/`
2. 扫描 `dist/` 下所有文件，生成 manifest 映射 `URL 路径 → 磁盘文件路径`
3. 把 manifest 写到 `packages/opencode/src/server/shared/web-ui-manifest.gen.ts`

每个文件用 `import ... with { type: "file" }` 引入，导出 `default: Record<string, string>`，与现有 `embeddedUI` 机制对齐。

### 改动 6：ui.ts 添加磁盘 manifest 回退

**文件**：`packages/opencode/src/server/shared/ui.ts` 的 `embeddedUI()`

```diff
 export function embeddedUI(disableEmbeddedWebUi: boolean) {
   if (disableEmbeddedWebUi) return Promise.resolve(null)
-  return (embeddedUIPromise ??=
-    // @ts-expect-error - generated file at build time
-    import("opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null))
+  return (embeddedUIPromise ??= (async () => {
+    // 编译产物：Bun.build 虚拟文件
+    try {
+      // @ts-expect-error - generated file at build time
+      const module = await import("opencode-web-ui.gen.ts")
+      if (module.default) return module.default as Record<string, string>
+    } catch {}
+    // 源码模式：磁盘上的 manifest（script/build-web.ts 生成）
+    try {
+      const module = await import("./web-ui-manifest.gen")
+      if (module.default) return module.default as Record<string, string>
+    } catch {}
+    return null
+  })())
 }
```

**原因**：原代码只支持编译二进制（Bun.build 虚拟文件）。源码模式下 bare specifier `opencode-web-ui.gen.ts` 无法解析，会回退到代理 `app.opencode.ai`。新增磁盘 manifest 回退后，源码模式也能内嵌本地打包的 UI。

### 改动 7：根 package.json 新增脚本

```json
"build:web": "bun run --cwd packages/opencode script/build-web.ts",
"web": "bun run --cwd packages/opencode --conditions=browser src/index.ts web"
```

### 改动 8：gitignore 排除生成的 manifest

```diff
+# Generated by script/build-web.ts (embedded web UI manifest)
+packages/opencode/src/server/shared/web-ui-manifest.gen.ts
```

### 完整使用流程

```bash
# 1. 一次性构建（前端打包 + 生成 manifest）
bun run build:web

# 2. 启动（单进程、单端口 4096，自动开浏览器）
OPENCODE_FIXED_DIRECTORY=/Users/chen/Development bun run web
```

可选参数：
- `--skip-build`：跳过前端构建，只重新生成 manifest（前端没改时省时间）
- `--only-build`：只构建前端，不生成 manifest

**端口**：默认 `127.0.0.1:4096`，浏览器访问该地址即可，前后端同一个进程。

## CORS 提示说明

浏览器 Console 出现 `strict-origin-when-cross-origin` 不是错误，是浏览器默认的 **Referrer-Policy**，表示跨域请求只发送 origin。后端 CORS 配置（`packages/opencode/src/server/cors.ts`）已经放行所有 `http://localhost:*` 和 `http://127.0.0.1:*`，不影响请求成功。

## Safari SSE 连接失败

Safari 17+ 的本地网络隐私限制会阻止页面访问 `localhost`，导致 SSE 事件流报 `TypeError: Load failed`。开发调试建议用 Chrome。生产模式下因为前后端同源（同端口），此问题消失。
