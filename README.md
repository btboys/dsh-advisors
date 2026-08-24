# dsh-advisors

DeepSeek Harness（dsh）的 **advisor 插件**：一个独立的后台审阅模型观察主 agent 的每一轮工作，把按严重级别分类的审阅意见注入会话，让主 agent 在代价变大之前纠正方向。

## 工作原理

```
主 agent turn 完成 (turn/end · completed)
        │
        ▼
截取上次审阅以来的会话事件 ──► 渲染成 transcript
        │
        ▼
每个启用的 advisor 用独立 LLM 调用审阅
（可选 read / grep / glob 只读调查工具，最多 toolRounds 轮）
        │
        ▼
解析 JSON 结论 {"notes": [{severity, note}]}
        │
        ▼
按严重级别路由回主会话：
  nit     → agent.inject()   不打断的旁注，下一个安全边界生效
  concern → agent.steer()    引导仍在进行的工作转向
  blocker → agent.steer()    空闲时会开启新的一轮，触发修正
```

防震荡机制：

- **免疫窗口**：一次 steer 之后 `immuneTurns`（默认 3）个主 agent turn 内，concern/blocker 降级为旁注；
- **去重**：同一 session 内内容重复的 note 会被抑制；
- **防自激**：只审阅包含真实用户消息的区间，advisor 自己的意见触发的 turn 不会被再次审阅；
- 只审阅顶层 agent，subagent 会话不审。

## 安装

已发布到 npm（[`dsh-advisors`](https://www.npmjs.com/package/dsh-advisors)），用 `dsh plugin` 安装到目标 profile：

```bash
dsh plugin --profile web add dsh-advisors       # Web GUI
dsh plugin --profile headless add dsh-advisors  # headless
```

包声明了 `dsh.bundle.patch`，安装后会自动成为 bundle 层被加载。重启 profile 生效。

## 配置

全部通过配置文件控制（`~/.dsh/profiles/<profile>/cordis.patch.yml` 中按 `id: advisors` 覆盖，或 `$DSH_HOME/cordis.patch.yml` 全局覆盖）。**没有 slash command**——开关就是 `enabled` 或整条 `disabled: true`。

```yaml
- id: advisors
  config:
    # 总开关（默认 true）；false 则插件加载但从不审阅
    enabled: true

    # 审阅模型路由：留空 = 沿用被审 agent 自己的 provider/model
    provider: ''
    model: ''              # 也支持 "provider/model" 单字符串写法
    reasoningEffort: ''

    # 追加给每个 advisor 的共享指导
    instructions: ''

    # 是否加载 ADVISORS.md 指导文件（默认 true）
    guidance: true

    # 一次 steer 后的免疫 turn 数（默认 3），期间 concern/blocker 降级为旁注
    immuneTurns: 3

    # 每次审阅喂给 advisor 的 transcript 字符上限（默认 12000）
    maxTranscriptChars: 12000

    # 调查工具轮数上限（默认 3；0 = 只看 transcript）
    toolRounds: 3

    # advisor 单次请求的输出 token 上限（默认 2048）
    reviewMaxTokens: 2048

    # 诊断日志文件（JSONL，记录 trigger/verdict/deliver/error）；默认关闭
    debugLog: ''

    # headless 等短生命周期 profile 建议 true：进程退出前的 session flush
    # 会等待在途审阅完成（上限 30s），否则最终审阅可能来不及落盘。
    # 长运行的 web profile 保持 false（默认）
    awaitReviewOnFlush: false

    # 专家名册；为空 = 使用名册文件 / 单个默认 advisor
    advisors: []

    # 是否发现名册文件（默认 true；仅当 advisors 为空时生效）
    roster: true
```

### 名册（roster）条目

```yaml
advisors:
  - name: Security                 # 必填，显示名兼去重标识
    enabled: true                  # 默认 true；false 保留条目但暂停
    model: 'anthropic/claude-sonnet-4-5'   # 可覆盖插件级路由
    instructions: |                # 该 advisor 的专长方向
      重点关注注入风险、硬编码密钥、不安全的文件写入。
    tools: [read, grep, glob]      # 默认全部三个只读工具；[] 或 false = 无工具
```

> **工具授权是安全边界**：read/grep/glob 均为只读且限制在工作区内，插件不提供任何写工具。

## 名册文件（WATCHDOG.yml / ADVISORS.yml）

当 patch 配置里没有显式 `advisors` 名册时，插件会发现名册文件；一旦发现任何条目，名册即取代单个默认 advisor。四种文件名都会被识别：`WATCHDOG.yml`、`WATCHDOG.yaml`、`ADVISORS.yml`、`ADVISORS.yaml`。

发现路径（所有可读文件都参与）：

1. `$DSH_HOME/`（默认 `~/.dsh/`）——用户级名册；
2. 工作区目录及其每级父目录（直到 Git 根，无 Git 时到家目录）的同名文件，以及各自的 `.dsh/` 子目录。

合并语义：

- 顶层 `instructions` 跨文件累积（用户级在前，项目文件由外向内）；
- advisor 条目按名字 slug 去重：**内层（更贴近工作区）条目替换同名的祖先/用户条目**；
- YAML 非法或结构非法的文件会被跳过并打日志，不影响主会话；
- 名册文件在**每次审阅时重新读取**，编辑后无需重启。

```yaml
# WATCHDOG.yml
instructions: |
  优先选择不破坏公开 API 的修复；测试保持聚焦。
advisors:
  - name: Architecture
    enabled: true
    model: anthropic/claude-sonnet-4-5   # 可省略，沿用插件级/主 agent 路由
    tools: [read, grep, glob]
    instructions: |
      关注模块边界与依赖方向。
  - name: Security
    tools: []                            # 无调查工具，只看 transcript
    instructions: |
      关注注入、密钥泄露与不安全写入。
```

## ADVISORS.md 项目指导

把「只给审阅者看的项目约定」写进 `ADVISORS.md`。发现路径：

1. `$DSH_HOME/ADVISORS.md`（用户级，默认 `~/.dsh/ADVISORS.md`）；
2. 工作区目录的 `ADVISORS.md` 与 `.dsh/ADVISORS.md`；
3. 向上每级父目录的同名文件，直到 Git 根（无 Git 仓库时到家目录）。

所有可读文件都会参与：外层指导在前、最贴近工作区的指导在最后（最突出）。

```markdown
# 审阅重点
- 绕过 `src/jobs/` 持久队列的写操作
- 未转义渲染的用户可控文本
- 没有向后兼容方案的 schema 变更
```

## 隐私与成本

- 开启 advisor 会把会话材料（你的提示、主 agent 输出与工具结果）发送给 advisor 模型的提供商；调查工具还可能读取项目文件内容一并发送。
- advisor 使用独立模型调用、独立计费。例行小改动可临时 `enabled: false`，或换用更便宜的审阅模型。

## 开发

```bash
pnpm install
pnpm build        # tsc → lib/
node test/unit.mjs
```

## License

MIT
