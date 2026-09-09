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
