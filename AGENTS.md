# Cap7CE 项目规则

## 开始工作

- 修改前先阅读 `CHANGELOG.md` 和 `docs/SOFTWARE_ARCHITECTURE.md`。
- 先检查 Git 状态，保留用户已有及无关修改。
- 涉及窗口状态机、缓存、索引、SQLite 或跨进程功能时，先讨论方案。
- 明确且局部的界面调整可以直接实施。

## 修改范围

- 优先进行最小范围修改，不顺手重构无关代码。
- 保持现有 micro、mini、normal、line 和 Settings 状态语义。
- 不恢复已经移除的 edge hidden 行为。
- 不修改用户数据和旧缓存，除非任务明确要求。

## 验证

- 完成代码修改后运行 `npm run build`。
- 运行 `git diff --check`。
- 交互和视觉效果由用户手动验证。
- 未执行 `npm run pack` 时，不得声称安装包验证通过。

## Git

- 用户确认后再提交。
- 每个独立功能或修复使用独立提交，除非用户明确要求覆盖提交。
- 不提交临时测试文件、计划草稿或动效实验页面，除非用户明确要求。
- 个人项目、沟通记录和未实施规划保存在公开仓库之外。
- 不使用 `git reset --hard` 等破坏性操作。

## 发布

版本发布时同步检查：

- `package.json`
- `package-lock.json`
- `src/renderer/App.tsx` 中的软件版本
- `CHANGELOG.md`
- `docs/SOFTWARE_ARCHITECTURE.md`
