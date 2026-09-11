我想做一个claude plugin，用于支持BDD(Behaviour-Driven Development)开发.

BDD要基于cucumber + Playwright + 多种开发语言支持。


## 要有以下功能：

1. 对一句简单的需求进行挖掘，并将其分解成Gherkin文档
2. 要有把Gherkin文档生成HTML Report的功能（供管理者审阅）
3. 要有在使用者的项目里初始化cucumber + Playwright测试环境的功能
4. 要有执行cucumber测试的功能，以及统计需求覆盖率的功能
5. 要有在执行cucumber测试的时候，通过Playwright来获取页面截图，并且总结成页面跳转图的功能
5. 要有通过Gherkin生成数据库DDL的功能

## 所有的skill/comamnd都要满足以下要求：

1. 使用英文来定义
2. 在与AI模型交流时使用英文
3. 在与用户交流的时候，使用用户设置的语言

## v2

我想要对bdd plugin进行扩展（version 2）。

目前通过bdd plugin生成的feature文件，并不能直接用于开发。因为它缺少了像 planning-with-files plugin 里的plan功能（规划，进度管理，上下文管理），也缺少了ecc plugin里的tdd-workflow skill那样真正推进开发的skill。

我想这样来做，根据bdd plugin生成的feature文件，模仿planning-with-files plugin来生成task_plan/progress/findings文件，然后准备一个类似于ecc plugin里的tdd-workflow的skill，使用tdd的开发模式来推进开发

## v3

我想要对bdd plugin进行扩展（version 3）。

1. 我想要添加一个草图UI功能，在完成feature文件之后，应该可以从feature中推演出UIUX。我想做一个HTML canvas的页面，就像Figma那样，然后把草图UI展示出来，并描绘出页面跳转图

## v4

我想要对bdd plugin进行扩展（version 4）。

目前用bdd plugin开发UI页面有个硬伤：Phase 3.x只写"通过测试的最少代码"，
而Gherkin只描述行为、sketch只画灰度线框、单元测试和cucumber场景断言的也全是行为，
样式从来没有被指定过，所以产出的页面根本不能用。

1. 用DESIGN.md（Google design.md格式）作为设计系统规格，不新造格式
2. 三个来源任一即可：DESIGN.md / UI组件库（shadcn/ui等）/ 设计顾问plugin
   （ui-ux-pro-max等）。都没有则用顾问plugin托底生成
3. 把DESIGN.md编译成项目能用的token代码（tokens.css / tailwind theme / theme.ts）
4. Phase 3.x的"最小"重新定义为**相对DESIGN.md的最小**，而不是相对空白的最小
5. 把bootstrap skill拆开：`bdd-setup`（cucumber harness）+
   `design-system-setup`（设计系统），再加一个`bootstrap` command调用这两个

自动验证（拿DESIGN.md的期望值比对实际computed style）留到v5。

方案见 docs/v4-design-system.md
