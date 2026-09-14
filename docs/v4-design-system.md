# v4 方案：设计系统

**状态**：待评审，未实施
**日期**：2026-09-10

---

## 1. 问题

用 bdd plugin 开发 UI 页面，产出的页面没有 CSS，不能用。

表面上看是 Phase 4.x 的「Write the minimum production code that satisfies this
capability's test」太克制。实际不是。TDD 的「最小代码」只在**测试覆盖了你在乎的
一切**时才成立，而这条链路上：

| 环节 | 它说了什么 | 它没说什么 |
|---|---|---|
| `discover` → Gherkin | 系统该做什么 | 它长什么样 |
| `sketch` → 线框板 | 页面上有哪些元素、点了会怎样 | 明确拒绝谈样式 |
| Phase 3 单元测试 | 一个能力的行为 | 无 |
| Phase 6 cucumber | 场景的行为 | 无 |

**样式从来没有被指定过**，所以「最小代码」正确地产出了零样式。
把 Phase 4.x 改成「写好看的代码」不解决问题：TDD 纪律会失效，而仍然没有任何
东西定义「好看」是什么。缺的是**规格**。

## 2. v4 做什么，不做什么

**做**：让每个 UI 项目都有一份设计系统规格，并把它编译成代码真能用的 token，
然后让 Phase 4.x 照着它写。

**不做**：自动验证。原方案设计过两道关卡（静态 lint、渲染检查），
v4 全部去掉 —— 静态 lint 只能做正则扫描，意义不大；UA 默认值探测又太绕。
**留到 v5**，届时的正确形态见第 4 节。

**因此要说清楚**：v4 把第 1 节的根因解决了一半。规格有了，
但「Phase 4.x 没照做」仍然不会让任何东西变红。这是 v4 已知的、故意留下的缺口，
不是疏漏（Rule 12）。

## 3. 设计系统

### 3.1 DESIGN.md 已经是规格，不需要再造一层

Google `design.md` 格式的 `DESIGN.md` 是**结构化、机器可读**的：

- YAML frontmatter：`colors` / `typography` / `rounded` / `spacing` / `components`
- token 引用语法 `{colors.primary}`
- `components:` 段精确到 `backgroundColor` / `padding` / `rounded` / `border`
- markdown body：用法说明、Do's and Don'ts、响应式断点、Known Gaps
- 自带工具：`npx @google/design.md lint DESIGN.md`

这推翻了原方案的两个假设：「DESIGN.md 是自由散文没法解析」是错的；
「需要 `docs/design-system.md` 把多个来源归一化」是多余的中间层。

**所以：不新造任何格式，`DESIGN.md` 就是这个 plugin 的设计系统文件。**
原方案的三层结构（Intent / Tokens / Implementation）取消 ——
那三层的内容 DESIGN.md 自己的分节里全都有。

文件名**只认 `DESIGN.md`**（项目根），不猜 `STYLEGUIDE.md` 之类的别名：
猜文件名会让「为什么没读到我的设计稿」变成一个没法自查的问题。

### 3.2 三个来源，任一即可

| 来源 | 提供什么 |
|---|---|
| `DESIGN.md` | 完整规格 |
| UI 组件库（shadcn/ui、Ant Design、MUI、Bootstrap…） | 组件实现与它自带的 token |
| 设计顾问 plugin（ui-ux-pro-max 等，用户指定） | 能生成一份设计系统 |

**有一个就够**，不要求三个都有。

**三个都没有 → 用顾问 plugin 托底生成，不阻塞、不追问。** 默认
`ui-ux-pro-max`，可由用户改成别的 —— skill 不内置任何顾问的接口知识，
按那个 plugin 自己的方式调用它。

这是与原方案的一处实质改动：原来写的是「Implementation 与 Tokens 同时为空
时问用户三选一」。托底更好 —— 一个空白项目最不需要的就是先回答三道选择题，
而生成出来的东西本来就是可以再改的。

### 3.3 不统一格式，统一指针

一个很有诱惑力但错误的做法：让 skill 不论来源都产出一份 `DESIGN.md`。
**不要这样做** —— 那是为了「下游只认一个文件」的整洁感，去制造二手抄本。

各来源的实际形态本来就不同：

| 来源 | 设计系统在哪 | 能转成 DESIGN.md 吗 |
|---|---|---|
| `DESIGN.md` | 它自己 | — |
| shadcn/ui | `components/ui/*.tsx` 的 cva 变体 + `globals.css` 的 CSS 变量 + `components.json` | 能提取，但**不该** |
| ui-ux-pro-max | 它自己的 `design-system/MASTER.md` + `pages/*.md` 层级覆盖 | 不能直接生成，格式不同 |

**shadcn 的例子最清楚**：它的 CSS 变量已经是 token，不需要编译；
它的组件源码**就是**组件规格，而且是活的、权威的。
生成一份 DESIGN.md 去描述它，等于造抄本 —— 改了 `Button` 的 cva，抄本不会跟着变。
制造第二个事实来源，正是这份方案在别处反复反对的事。

**ui-ux-pro-max 的格式也不兼容**：它的颜色是「Role / Hex / CSS Variable」三列表，
**没有 `components:` 段** —— 没有 `button-primary` 的 `backgroundColor` /
`padding` / `rounded` 这种精确到组件的规格。硬转会丢掉它的 pages 覆盖机制，
缺的部分还得凭空编。

**所以统一的是指针，不是格式。** Phase 4.x 需要的是「我该照着什么写」，
这条记录写进 `task_plan.md` —— `planning` skill 已经在那里记项目的六个测试命令，
加一行「设计系统在哪、是什么形态」是自然延伸，不需要新文件。

### 3.4 编译：条件性的，不是每次都做

设计系统里的值要能被代码引用。这一步**取决于来源已经落到哪一步**：

| 来源 | 要不要编译 |
|---|---|
| shadcn/ui | **不要**。CSS 变量已经在 `globals.css` 里，直接可用 |
| `DESIGN.md` | **要**。它是 YAML 规格，代码读不了 |
| ui-ux-pro-max 的 `MASTER.md` | **看情况**。它有 CSS Variable 列，但要落成实际的 CSS 文件 |

需要编译时，按项目栈选产物形式：

| 项目栈 | 编译产物 |
|---|---|
| 原生 CSS | `styles/tokens.css` 的 `:root` 自定义属性 |
| Tailwind | `tailwind.config` 的 `theme.extend` |
| SCSS | `_tokens.scss` |
| CSS-in-JS | `theme.ts` |

产物是**代码，进源码树**，不是文档。`{colors.primary}` 这样的引用要在编译时
解开成实际值。

**编译是幂等的**：源规格改了就重跑，覆盖生成的 token 文件。
所以生成物顶部要有「此文件由 design-system-setup 生成，不要手改」的标记 ——
手改会在下次重跑时丢失。

反过来说，**能不生成就不生成**。shadcn 这类自带 token 的栈，
skill 该做的只是确认它装好了、样式真的生效，而不是再产出一份东西来管理。

### 3.5 design-system-setup 的流程

1. **探测三个来源**（3.2）。任一存在即可继续。
2. **都没有 → 顾问 plugin 托底生成**，用它自己的格式，不转换。
3. **不生成抄本**（3.3）。已有的来源就用它原样。
4. **按需编译 token**（3.4）。shadcn 这类自带 token 的栈跳过这步。
5. **把指针写进 `task_plan.md`**：设计系统在哪、是什么形态，供 Phase 4.x 查。
6. **自证可用**：生成一个 demo 页，把这套设计系统的主要 token 和组件都用上
   一次，跑起来截图给用户看。没跑过的设计系统不算建立 ——
   装了依赖不等于样式真的生效了。

**它要能独立跑。** 项目已有 harness、只想补设计系统，是常见情况。
所以 lane（web / mobile）由它自己探测：看依赖里是 Playwright 还是 Appium。

**重跑语义是「更新」，不是「修复」。** 改了 `DESIGN.md`、换了组件库、
加了一个 token，都该能重跑来同步。这与 `bdd-setup` 的重跑语义（修复一个装坏了
的 harness）不同，也是两者该分开的原因之一（第 7 节）。

**v4 只做 web lane。** mobile 的组件体系不同（Compose / SwiftUI / React
Native），留到后续。

## 4. 验证留到 v5

v4 不做自动验证。记下 v5 该做成什么样，免得下次又从头想：

**正确形态是拿设计系统里的期望值比对实际 computed style。**

```
DESIGN.md 说： button-primary.backgroundColor = {colors.primary} = #5645d4
Playwright 抓： 实际 background-color = rgb(239,239,239)
                                        ↑ 不符合规格，失败
```

它比 v4 放弃的两条路都好：不像正则 lint 那样靠启发式，也不像 UA 默认值探测那样
需要一张参照表和分浏览器的降级。规格里写着期望值，直接比就是了 ——
而且顺带解决了「没样式」，因为没样式的按钮背景是浏览器灰，自然对不上。

已知的难点：得知道页面上哪个元素对应哪条组件规格，需要一个标记约定
（如 `data-ds="button-primary"`）。这是 v5 要解决的主要设计问题。

## 5. Phase 措辞修正

**a. `commands/plan-with-feature.md` 加前置阻塞。**
feature 带 `@web` 标签、但项目没有任何设计系统来源 → 停下，指向
`design-system-setup`。不静默降级成「先做着，样式以后补」。

**b. `skills/planning/assets/task_plan-bdd.md` 的 Phase 4.x 第一条**，
在现有的 "Write the minimum production code that satisfies this capability's
test." 之后补一句限定：

> Minimum is measured against the design system this plan names, not against a
> blank page. Style every element this capability renders, using the components
> and tokens that design system defines. Do not invent a value it does not
> define, and do not leave an element to the browser's defaults — both are
> outside the spec, and neither is smaller than following it.

关键在于：这**不放宽** TDD 纪律。跟着规格写和不跟着写，代码量是一样的，
但一个能用一个不能用。

**c. Phase 6 不加检查** —— v4 没有可加的自动检查（第 4 节）。
v5 补上验证时，这里加一条。

## 6. sketch 不进实现链路

`sketch` 仍然是灰度线框，仍然拒绝成为设计 —— 这个定位是对的，它存在的意义是让
reviewer 争论内容而不是颜色。

**v4 不碰它，也不从它取任何东西。** 一度考虑过让 `wireframe-vocabulary.md` 的
27 种元素类型经一张映射表落到组件，这是错的：

- `sketch` 自己就写着 "A sketch is inference, not specification"，
  把它当实现输入等于把推断升格成规格
- `sketch` 是可选环节，不跑它的项目就缺一块
- 那 27 种类型是为了**画得出来**设计的（`spinner` / `divider` / `empty`），
  粒度对不上实现
- 耦合方向反了：设计系统是项目级长期资产，`sketch` 是每 feature 一次性的评审
  产物

Phase 4.x 要的确定性由项目的设计系统提供，它与 `sketch` 跑没跑过无关。

## 7. skill 与 command 的划分

```
/bdd:bootstrap              初始化整个项目（command）
  ├─ /bdd:bdd-setup           cucumber + Playwright/Appium + 步骤定义
  └─ /bdd:design-system-setup 设计系统的落地与按需编译
```

`bootstrap` 由 skill **改名为 command**，职责从「装 harness」变成「把一个项目
初始化到能跑 BDD」，按顺序调用两个 skill。

**为什么分开**：harness 是测试基础设施，装完基本不动，重跑是**修复**语义
（现有 SKILL.md 就有「Repairing an existing harness」一节）；设计系统是产品的
一部分，会随产品演进，重跑是**更新**语义。两种语义放一个 skill 里会打架。
触发条件也独立 —— `plan-with-feature` 缺设计系统时要指向的是
`design-system-setup` 一个，不是让用户重跑整个初始化。

顺序上 `bdd-setup` 先跑（它探测语言栈和 lane），但 `design-system-setup`
必须能单独跑。

**改名成本**：`bootstrap` 作为 skill 名在仓库里被引用约 **30 处、跨 12 个
文件**，包括 `flow-map` / `run` / `planning` / `discover` 的 SKILL.md、
`references/` 下三个文件、两个 `.cjs` 的注释，以及 README 的技能表和典型流程。
全是文本替换，但要一次做干净：漏一处就是死引用。
**改名单独一个 commit**，与功能改动分开，否则 diff 没法审。

## 8. 改动清单

| 文件 | 改动 |
|---|---|
| `skills/bootstrap/` → `skills/bdd-setup/` | 目录改名；SKILL.md 的 `name` 与标题同步 |
| 全仓库 ~30 处 `bootstrap` 引用 | 指向 `bdd-setup`（单独 commit） |
| `skills/design-system-setup/SKILL.md` | **新增** —— 三来源探测、顾问托底、按需编译、写指针、demo 自证 |
| `skills/design-system-setup/references/design-sources.md` | **新增** —— 三种来源各自的探测判据、`design.md` 格式要点、各栈的编译产物形式 |
| `commands/bootstrap.md` | **新增** —— 按序调用两个 skill |
| `skills/planning/assets/task_plan-bdd.md` | Phase 4.x 措辞；新增「设计系统在哪」一行 |
| `commands/plan-with-feature.md` | `@web` 无设计系统 → 阻塞，指向 `design-system-setup` |
| `README.md` | 技能表、命令表、典型流程 |

不新增脚本，不新增环境变量 —— v4 没有自动检查。

## 9. 已定

- **v4 只做 web lane**，mobile 留到后续
- **不做自动验证**，留到 v5；形态见第 4 节
- **不新造格式，也不做格式转换**。各来源保持原样：`DESIGN.md`、shadcn 的
  组件与 CSS 变量、ui-ux-pro-max 的 `MASTER.md`，都不互相转抄（3.3）
- 统一的是**指针**（写进 `task_plan.md`），不是文件格式
- 取消原方案的三层结构和 `docs/design-system.md`
- **编译是条件性的**：shadcn 这类自带 token 的栈跳过（3.4）
- 用 `DESIGN.md` 时文件名**只认这一个**，不猜别名
- **三个来源任一即可**（DESIGN.md / UI 组件库 / 顾问 plugin）；
  都没有则用顾问 plugin 托底生成，不阻塞
- 设计顾问 plugin **可插拔**，默认 `ui-ux-pro-max`，由用户指定
- **不使用** `wireframe-vocabulary.md`，`sketch` 不进实现链路
- **不做替换规则表**（原生元素 + 全局样式表是正当形态）
- **拆成两个 skill 加一个 command**：`bdd-setup` / `design-system-setup` /
  `bootstrap`

## 实施顺序

1. **改名 commit**：`skills/bootstrap/` → `skills/bdd-setup/`，全仓库引用同步。
   不夹带任何功能改动。
2. `skills/design-system-setup/` —— skill 本体与 `design-md.md` 参考。
3. `commands/bootstrap.md` —— 编排两个 skill。
4. `task_plan-bdd.md` 与 `plan-with-feature.md` 的措辞与阻塞。
5. `README.md` 同步。
