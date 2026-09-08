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