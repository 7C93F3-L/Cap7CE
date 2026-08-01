# Cap7CE 快捷指令方案（冒号语法版）

> 用途：替代早期“快捷指令草案”，作为后续实现快捷指令系统的规则基准。  
> 当前定位：方案文档，不代表立即实现全部命令。  
> 核心原则：快捷指令不是自然语言助手，而是用于快速完成连续点击操作的命令入口。

---

## 1. 总体规则

### 1.1 统一语法

所有快捷指令统一采用：

```text
领域:动作 参数
```

示例：

```text
see:all
win:micro
idx:all
ui:dark
model:refresh
dir:delete "测试目录"
```

其中：

- `领域` 表示功能类别。
- `:` 是快捷指令识别标记。
- `动作` 表示具体操作。
- `参数` 可选，例如目录名、模型名、颜色值等。

---

### 1.2 搜索与指令的边界

只有输入内容以“白名单领域 + 冒号”开头时，才进入快捷指令解析。

白名单领域：

```text
see:
win:
tag:
idx:
dir:
cache:
skim:
set:
ui:
line:
edge:
key:
cmd:
lang:
llama:
model:
app:
```

否则一律作为普通搜索词处理。

例如：

```text
女
蓝发 女
c:
win micro
see all
```

以上都应作为普通搜索，而不是快捷指令。

---

### 1.3 冒号规则

推荐使用半角英文冒号：

```text
:
```

可选兼容中文输入法下的全角冒号：

```text
：
```

实现时可以将全角冒号规范化为半角冒号，但只在识别到白名单领域时生效。

---

### 1.4 不做单字母别名

不设置：

```text
s
a
n
m
q
```

这类单字母快捷别名。

原因：

- 用户可能搜索的正是单个字母。
- 会污染搜索输入。
- 后续维护容易混乱。
- 快捷指令应通过冒号区分，不靠猜测用户意图。

---

### 1.5 不做自然语言猜测

不支持：

```text
打开设置
切换暗色
查看所有图片
```

这类自然语言命令。

原因：

- 容易误判搜索词。
- 会增加解析复杂度。
- 不符合“快速键入连续操作”的定位。

快捷指令只识别明确语法。

---

### 1.6 错误处理

如果输入命中白名单领域，但动作不存在，应显示轻提示，不应自动转为搜索。

例如：

```text
win:abc
```

提示：

```text
未知窗口指令：abc
```

如果输入未命中白名单领域，则作为普通搜索。

---

### 1.7 参数规则

带空格、特殊符号或中文长名称的参数，推荐使用英文双引号包裹：

```text
see:dir "产品图"
idx:dir "2026 宣传图"
model:use "Qwen3-VL-4B-Instruct-Q4_K_M.gguf"
```

不含空格的短参数可以不加引号：

```text
llama:use b9577
ui:main #7C93F3
```

---

## 2. 命令分类设计

## 2.1 查看类：`see:`

用于切换当前查看范围，本质上是替代设置页统计按钮、目录标签、查看筛选等连续点击。

| 指令               | 含义        | 风险  |
| ---------------- | --------- | --- |
| `see:all`        | 查看全部已添加文件 | 低   |
| `see:indexed`    | 查看已识别文件   | 低   |
| `see:unindexed`  | 查看未识别文件   | 低   |
| `see:dir "目录名称"` | 查看指定目录    | 低   |

示例：

```text
see:all
see:indexed
see:unindexed
see:dir "产品图"
```

---

## 2.2 窗口模式类：`win:`

用于切换 Cap7CE 的不同窗口展开形态。

| 指令            | 含义                 | 风险  |
| ------------- | ------------------ | --- |
| `win:line`    | 切换为 line 模式         | 低   |
| `win:cap`     | 切换为 capsule 模式      | 低   |
| `win:micro`   | 切换为 micro 模式        | 低   |
| `win:mini`    | 切换为 mini 模式         | 低   |
| `win:normal`  | 切换为 normal 模式       | 低   |
| `win:max`     | 窗口最大化，后续评估          | 中   |
| `win:top on`  | 窗口置顶               | 中   |
| `win:top off` | 取消窗口置顶             | 中   |

建议第一版只实现：

```text
win:line
win:cap
win:micro
win:mini
win:normal
```

`win:max`、`win:top on/off` 可后置。

---

## 2.3 标签类：`tag:`

用于控制搜索胶囊内标签显示与选择。

| 指令               | 含义       | 风险  |
| ---------------- | -------- | --- |
| `tag:dir`        | 显示目录标签   | 低   |
| `tag:dir "目录名称"` | 选择指定目录标签 | 低   |
| `tag:sort`       | 显示排序标签   | 低   |
| `tag:sort asc`   | 切换为升序排序  | 低   |
| `tag:sort desc`  | 切换为降序排序  | 低   |
| `tag:show all`   | 显示所有标签   | 低   |
| `tag:hide all`   | 隐藏所有标签   | 低   |
| `tag:hide dir`   | 隐藏目录标签   | 低   |
| `tag:hide sort`  | 隐藏排序标签   | 低   |

示例：

```text
tag:dir
tag:dir "产品图"
tag:sort desc
tag:hide all
```

---

## 2.4 索引类：`idx:`

用于启动、继续或停止视觉索引任务。

| 指令               | 含义        | 风险     |
| ---------------- | --------- | ------ |
| `idx:all`        | 更新全部索引    | 中      |
| `idx:dir "目录名称"` | 识别指定目录    | 中      |
| `idx:continue`   | 继续识别未完成文件 | 中      |
| `idx:stop`       | 停止当前识别任务  | 中      |
| `idx:clear all`  | 清除全部索引    | 高，必须确认 |

示例：

```text
idx:all
idx:dir "产品图"
idx:continue
idx:stop
idx:clear all
```

建议第一版实现：

```text
idx:all
idx:dir "目录名称"
idx:continue
idx:stop
```

`idx:clear all` 属于危险操作，后置并要求确认。

---

## 2.5 目录类：`dir:`

用于目录管理。

| 指令                       | 含义           | 风险     |
| ------------------------ | ------------ | ------ |
| `dir:add "完整路径"`         | 添加目录         | 中      |
| `dir:delete "目录名称"`      | 删除目录、索引和相关缓存 | 高，必须确认 |
| `dir:rename "旧名称" "新名称"` | 重命名目录显示名     | 中      |
| `dir:refresh`            | 刷新目录统计 / 状态  | 低      |

示例：

```text
dir:add "D:\\素材\\产品图"
dir:delete "产品图"
dir:rename "旧产品图" "新产品图"
dir:refresh
```

第一版建议只做：

```text
dir:refresh
```

`dir:add` 涉及路径解析，可后置。  
`dir:delete` 是危险操作，必须确认。

---

## 2.6 缓存类：`cache:`

用于视觉缓存清理。

| 指令              | 含义                  | 风险  |
| --------------- | ------------------- | --- |
| `cache:clear`   | 清理缩略图 / 预览 / 模型输入缓存 | 中   |
| `cache:thumb`   | 仅清理缩略图缓存，后续评估       | 中   |
| `cache:preview` | 仅清理预览缓存，后续评估        | 中   |
| `cache:model`   | 仅清理模型输入图缓存，后续评估     | 中   |
| `cache:skim`    | 清理 skim 缩略图、预览图及元数据缓存 | 中，必须确认 |

建议第一版只保留：

```text
cache:clear
```

如果只删除可重建缓存，可不强制确认，但应显示执行结果。

---

## 2.7 设置页类：`set:`

用于快速进入设置页及具体配置区。

| 指令          | 含义       | 风险  |
| ----------- | -------- | --- |
| `set:`      | 打开设置     | 低   |
| `set:quick` | 打开快捷动作配置 | 低   |
| `set:cmd`   | 查看快捷指令   | 低   |

示例：

```text
set:
set:quick
set:cmd
```

---

## 2.8 skim：`skim:`

用于进入 skim 及返回 skim 根目录。

| 指令 | 含义 | 风险 |
| --- | --- | --- |
| `skim:` | 进入 skim；已经位于 skim 时保持当前目录 | 低 |
| `skim:root` | 进入 skim 根目录 | 低 |

示例：

```text
skim:
skim:root
```

`skim:` 与 `skim:root` 都是确定性操作，不作为退出 skim 的开关。skim 的独立缓存归入缓存领域，通过 `cache:skim` 清理并复用快捷指令确认态；清理后缓存会在浏览时按需重新生成。

---

## 2.9 外观类：`ui:`

用于主题、颜色1、颜色2等界面外观设置。

| 指令                  | 含义       | 风险  |
| ------------------- | -------- | --- |
| `ui:light`          | 切换明亮模式   | 低   |
| `ui:dark`           | 切换黑暗模式   | 低   |
| `ui:auto`           | 跟随系统主题   | 低   |
| `ui:main #RRGGBB`   | 设置颜色1    | 低   |
| `ui:accent #RRGGBB` | 设置颜色2     | 低   |
| `ui:reset`          | 恢复默认外观配置 | 低   |

示例：

```text
ui:dark
ui:main #7C93F3
ui:accent #E5E5E5
ui:reset
```

颜色必须校验为合法十六进制色值，不区分大小写。

---

## 2.10 line：`line:`

用于控制 line 显示。

| 指令         | 含义    | 风险  |
| ---------- | ----- | --- |
| `line:on`  | 显示 line | 低   |
| `line:off` | 隐藏 line | 低   |

示例：

```text
line:on
line:off
```

---

## 2.11 边缘吸附类：`edge:`

用于控制边缘吸附。

| 指令         | 含义     | 风险  |
| ---------- | ------ | --- |
| `edge:on`  | 开启边缘吸附 | 低   |
| `edge:off` | 关闭边缘吸附 | 低   |

示例：

```text
edge:on
edge:off
```

注意：边缘吸附不应和“自动隐藏”混为一个命令。  
如果未来做贴边隐藏，应另设命令，例如：

```text
dock:auto on
dock:auto off
```

---

## 2.12 快捷键类：`key:`

用于控制快捷动作中的全局快捷键。

| 指令               | 含义         | 风险  |
| ---------------- | ---------- | --- |
| `key:global on`  | 启用全局快捷键    | 低   |
| `key:global off` | 禁用全局快捷键    | 低   |
| `key:reset`      | 恢复快捷动作默认配置 | 低   |

示例：

```text
key:global on
key:global off
key:reset
```

说明：

- `key:global on/off` 只控制全局快捷键，例如 Alt + ` 激活胶囊。
- 不应影响窗口内快捷键，例如 Esc、Ctrl + ,。

---

## 2.13 快捷指令类：`cmd:`

用于控制快捷指令系统自身。

| 指令        | 含义       | 风险  |
| --------- | -------- | --- |
| `cmd:on`  | 启用快捷指令解析 | 低   |
| `cmd:off` | 禁用快捷指令解析 | 低   |

示例：

```text
cmd:on
cmd:off
```

建议：

- `cmd:off` 执行后，应保留某种重新打开入口，例如设置页按钮。
- 禁用后，输入框内容全部作为普通搜索词处理。

---

## 2.14 语言类：`lang:`

用于语言切换。该功能可以最后实现。

| 指令          | 含义     | 风险  |
| ----------- | ------ | --- |
| `lang:auto` | 跟随系统语言 | 低   |
| `lang:cn`   | 中文界面   | 低   |
| `lang:en`   | 英文界面   | 低   |

示例：

```text
lang:auto
lang:cn
lang:en
```

备注：

语言切换建议等所有功能项稳定后再统一接入，避免翻译和文案维护反复返工。

---

## 2.15 llama.cpp 运行时类：`llama:`

用于 llama.cpp 版本与运行状态管理。

| 指令                 | 含义                          | 风险  |
| ------------------ | --------------------------- | --- |
| `llama:start`      | 启动 llama.cpp / llama-server | 中   |
| `llama:stop`       | 停止 llama.cpp / llama-server | 中   |
| `llama:use "版本名称"` | 切换 llama.cpp 版本             | 中   |
| `llama:refresh`    | 刷新 llama.cpp 版本列表           | 低   |

示例：

```text
llama:start
llama:stop
llama:use "b9577"
llama:refresh
```

---

## 2.16 视觉模型类：`model:`

用于选择或刷新视觉模型。

| 指令                 | 含义       | 风险  |
| ------------------ | -------- | --- |
| `model:refresh`    | 刷新视觉模型列表 | 低   |
| `model:use "模型名称"` | 切换视觉模型   | 中   |

示例：

```text
model:refresh
model:use "Qwen3-VL-4B-Instruct-Q4_K_M.gguf"
```

说明：

若当前正在识别任务中，不建议直接切换模型。应提示停止当前任务或等待任务结束。

---

## 2.17 软件行为与操作类：`app:`

用于控制软件级运行行为，以及执行退出等全局操作。

| 指令                  | 含义                | 风险     |
| ------------------- | ----------------- | ------ |
| `app:startup on`    | 开启 Windows 开机运行   | 低      |
| `app:startup off`   | 关闭 Windows 开机运行   | 低      |
| `app:hints on`      | 显示搜索框操作提示         | 低      |
| `app:hints off`     | 关闭搜索框操作提示         | 低      |
| `app:quit`          | 关闭 Cap7CE 运行进程    | 高，必须确认 |

示例：

```text
app:startup on
app:hints off
app:quit
```

不建议继续使用：

```text
! off:
```

原因：

- 符号语义不直观。
- 容易与其它符号体系混用。
- 不利于后续文档展示。

---

## 3. 危险操作规则

以下命令属于危险操作，不能直接静默执行：

```text
dir:delete "目录名称"
idx:clear all
app:quit
```

未来如果支持源文件删除，也应归为危险操作：

```text
file:delete selected
file:delete "文件路径"
```

### 3.1 危险操作必须确认

危险操作执行流程：

```text
输入危险命令
↓
显示确认提示
↓
用户确认
↓
执行操作
```

### 3.2 确认方式

危险操作统一使用搜索胶囊内确认态。

执行危险操作后，搜索胶囊内显示确认提示，并等待用户输入：

```text
yes
no
```

示例：

```text
dir:delete "产品图"
```

触发后显示：

```text
将删除目录“产品图”及其索引和缓存。
输入 yes 确认，输入 no 取消。
```

规则：

- 输入 `yes` 并回车后执行危险操作。
- 输入 `no` 并回车后取消操作。
- 其他输入不执行操作，并提示：`请输入 yes 或 no`。
- 确认态下不执行普通搜索。
- 确认态下不解析新的快捷指令。
- 退出确认态后恢复普通搜索 / 快捷指令输入。
- micro / mini / normal 使用同一套确认态。
- 不新增独立确认窗口。

---

## 4. 第一版建议实现范围

第一版不要一次性实现全部命令。

建议第一版只实现低风险和中低风险命令：

```text
see:all
see:indexed
see:unindexed
see:dir "目录名称"

win:line
win:cap
win:micro
win:mini
win:normal

tag:dir
tag:dir "目录名称"
tag:sort asc
tag:sort desc
tag:show all
tag:hide all

set:
set:quick
set:cmd

skim:
skim:root

ui:light
ui:dark
ui:auto
ui:main #RRGGBB
ui:accent #RRGGBB
ui:reset

line:on
line:off

edge:on
edge:off

key:global on
key:global off

cmd:on
cmd:off

app:startup on
app:startup off
app:hints on
app:hints off

idx:continue
idx:stop

llama:refresh
model:refresh
```

中风险命令可第二阶段实现：

```text
idx:all
idx:dir "目录名称"
cache:clear
cache:skim
llama:start
llama:stop
llama:use "版本名称"
model:use "模型名称"
dir:refresh
```

危险命令最后实现：

```text
dir:delete "目录名称"
idx:clear all
app:quit
```

---

## 5. 解析器实现建议

### 5.1 解析顺序

```text
用户输入
↓
trim 去除首尾空格
↓
检测是否以白名单领域 + 冒号开头
↓
否：普通搜索
↓
是：进入快捷指令解析
↓
解析动作和参数
↓
校验动作是否合法
↓
校验参数是否合法
↓
执行或显示错误提示
```

---

### 5.2 白名单领域

```text
see
win
tag
idx
dir
cache
skim
set
ui
line
edge
key
cmd
lang
llama
model
app
```

---

### 5.3 不支持批量命令

第一版不支持：

```text
ui:dark; win:micro; see:all
```

原因：

- 容易误触发。
- 错误回滚复杂。
- 对当前阶段没有必要。

---

### 5.4 不支持模糊匹配

不支持：

```text
see:alll
win:norm
idx:contin
```

必须完整匹配。

原因：

- 快捷指令应稳定、可预测。
- 模糊匹配容易误执行。

---

### 5.5 执行反馈

每条快捷指令执行后，应给出短提示。

示例：

```text
已切换为 normal 模式
已隐藏 line
已刷新模型列表
未知指令：win:abc
缺少目录名称
```

提示应短、轻，不应打断连续操作。

---

## 6. 与搜索胶囊的关系

快捷指令依然从搜索胶囊输入。

输入流程：

```text
用户输入命令
↓
按 Enter
↓
如果命中快捷指令
   执行命令，不走搜索
否则
   执行普通搜索
```

执行快捷指令后：

- 命令执行成功后清空输入框。
- 命令执行失败时保留输入内容，方便用户修改。
- 不应破坏当前搜索关键词，除非命令本身用于切换查看范围。

---

## 7. 与设置页的关系

设置页【快捷指令】展开后应展示：

1. 是否启用快捷指令。
2. 简短语法说明。
3. 常用指令列表。
4. 危险指令说明。
5. 不支持用户自定义命令。

设置页展示的是正式命令，不展示内部别名，因为本方案不设置别名。

---

## 8. 不建议采用的语法

### 8.1 不建议符号分组

不建议：

```text
@ cata:
# micro:
! off:
```

原因：

- 符号多后记忆成本高。
- 每个符号含义不直观。
- 后续文档和设置页展示不够清晰。
- 容易和普通输入、Markdown、路径、命令行符号混淆。

---

### 8.2 不建议空格自然语法

不建议：

```text
see all
win micro
idx all
```

原因：

- 和普通搜索词边界不够清晰。
- 用户搜索英文短语时可能误触。
- 不如冒号语法稳定。

---

### 8.3 不建议极短别名

不建议：

```text
a
n
m
q
```

原因：

- 会污染普通搜索。
- 可读性差。
- 后续协作和开源文档不好维护。

---

## 9. 当前最终建议

Cap7CE 快捷指令系统应采用：

```text
领域:动作 参数
```

作为唯一正式语法。

核心判断：

```text
冒号决定是否进入快捷指令解析。
白名单领域决定是否属于 Cap7CE 命令。
动作必须完整匹配。
参数必须明确。
危险操作必须确认。
未命中命令则正常搜索。
```

这套规则兼顾：

- 输入速度
- 搜索安全
- 记忆成本
- 后续扩展
- 开源文档可读性
- 实现复杂度可控
