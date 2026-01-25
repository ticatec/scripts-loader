# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个强大的 TypeScript 动态脚本加载和管理库，支持实时脚本更新、缓存管理和时间戳持久化。

## 特性

- 🚀 **动态脚本加载** - 运行时动态加载和更新 JavaScript 脚本
- ⏰ **时间戳持久化** - 自动保存和恢复上次更新时间点
- 🔄 **实时更新** - 定时检查脚本更新并自动应用
- 💾 **智能缓存** - 内存缓存脚本模块，管理 require 缓存
- 🔥 **热重载** - 支持脚本热重载，无需重启应用
- 🧩 **单例管理器** - 使用 DynaModuleManager 集中管理脚本
- 🛡️ **错误处理** - 完善的错误处理和 log4js 日志记录
- 🔒 **并发保护** - 防止重复加载操作的竞态条件
- 📝 **TypeScript 支持** - 完整的类型定义和接口

## 安装

```bash
npm install @ticatec/script-loader
```

## 快速开始

### 步骤 1：实现 BaseScriptLoader

通过继承 `BaseScriptLoader` 并实现 `getUpdatedScripts` 方法来创建自定义脚本加载器：

```typescript
import { BaseScriptLoader } from '@ticatec/script-loader';
import type { DynaScript } from '@ticatec/script-loader/lib/DynaModuleManager';

class MyScriptLoader extends BaseScriptLoader {

  /**
   * 从数据源获取更新的脚本
   * @param anchor - 获取此时间戳之后更新的脚本
   * @returns DynaScript 对象数组
   */
  protected async getUpdatedScripts(anchor: Date): Promise<DynaScript[]> {
    // 示例：从数据库获取
    const scripts = await db.query(
      'SELECT * FROM scripts WHERE updated_at > ?',
      [anchor]
    );

    return scripts.map(script => ({
      keyCode: script.id,           // 唯一标识符
      fileName: script.name,         // 文件名（不含扩展名）
      active: script.status === 'active',
      latestUpdated: script.updated_at,
      scriptCode: script.content     // JavaScript 代码
    }));
  }
}
```

### 步骤 2：初始化 DynaModuleManager

```typescript
import DynaModuleManager from '@ticatec/script-loader';

// 初始化单例管理器
await DynaModuleManager.initialize(
  MyScriptLoader,           // 你的加载器类
  './scripts',              // 脚本存储目录
  5000                      // 轮询间隔（毫秒）
);
```

### 步骤 3：使用加载的脚本

```typescript
import DynaModuleManager from '@ticatec/script-loader';

// 获取已初始化的管理器实例
const manager = DynaModuleManager.getInstance();

// 通过 keyCode 获取脚本模块
const myScript = manager.get('script-key-123');

if (myScript) {
  // 使用加载的模块
  // 如果脚本导出了函数/类，直接使用
  myScript.someFunction();

  // 或者如果导出了 default
  const result = myScript.default();
}
```

## API 文档

### DynaScript 接口

`DynaScript` 接口定义了脚本元数据的结构：

```typescript
interface DynaScript {
  keyCode: string;        // 脚本的唯一标识符
  fileName: string;       // 脚本文件名（不含 .js 扩展名）
  active: boolean;        // 脚本是否激活
  latestUpdated: Date;    // 最后更新时间戳
  scriptCode: string;     // JavaScript 代码内容
}
```

### DynaModuleManager

#### 静态方法

##### `initialize<Args>(loaderConstructor, ...args): Promise<DynaModuleManager>`

初始化 DynaModuleManager 的单例实例。此方法必须在使用 `getInstance()` 之前调用。

- **参数**:
  - `loaderConstructor` - BaseScriptLoader 子类的构造函数
  - `...args` - 传递给加载器构造函数的参数（通常是 scriptDir 和 pollIntervalMs）
- **返回**: Promise，解析为 DynaModuleManager 实例
- **示例**:
  ```typescript
  await DynaModuleManager.initialize(MyScriptLoader, './scripts', 5000);
  ```

##### `getInstance(): DynaModuleManager`

获取 DynaModuleManager 的单例实例。如果未初始化则抛出错误。

- **返回**: DynaModuleManager 实例
- **抛出**: 如果尚未调用 `initialize()` 则抛出错误
- **示例**:
  ```typescript
  const manager = DynaModuleManager.getInstance();
  ```

#### 实例方法

##### `get(key: string): any | null`

通过 keyCode 获取已加载的脚本模块。

- **参数**: `key` - 脚本的唯一标识符（keyCode）
- **返回**: 加载的模块，如果未找到则返回 `null`

### BaseScriptLoader

#### 构造函数

```typescript
protected constructor(
  scriptHome: string,      // 脚本存储目录
  pollIntervalMs: number   // 轮询间隔（毫秒）
)
```

#### 抽象方法（必须实现）

##### `getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>`

从数据源获取更新的脚本。

- **参数**: `anchor` - 时间戳，获取此时间之后更新的脚本
- **返回**: Promise，解析为 DynaScript 对象数组

#### 公共方法

##### `init(): Promise<void>`

初始化脚本加载器。此方法由 DynaModuleManager 自动调用。

##### `getModule(key: string): any | null`

通过 keyCode 获取已加载的模块。

- **参数**: `key` - 脚本的唯一标识符
- **返回**: 加载的模块，如果未找到则返回 `null`

##### `stopWatching(): void`

停止定期脚本更新监控。

## 工作原理

### 初始化流程

1. **目录设置**: 在 `scriptHome` 下创建 `plugins` 目录
2. **时间戳加载**: 读取 `.last_update_timestamp` 文件或从 Unix epoch 开始
3. **初始加载**: 获取并加载自上次时间戳以来更新的所有脚本
4. **开始监控**: 开始定期轮询脚本更新

### 脚本生命周期

```
┌─────────────────┐
│  getUpdatedScripts  │
│  (从数据库/API)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  处理脚本           │
│  • active=true      │──► 写入文件并缓存模块
│  • active=false     │──► 删除文件并清除缓存
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 更新时间戳          │
│ 保存到 .last_       │
│ update_timestamp   │
└─────────────────┘
```

### 目录结构

```
scriptHome/
├── .last_update_timestamp    # 时间戳持久化文件
└── plugins/                  # 脚本文件目录
    ├── script1.js
    ├── script2.js
    └── ...
```

### 模块缓存

- 脚本作为 `.js` 文件写入 `plugins` 目录
- 使用 Node.js `require()` 加载模块
- 重新加载前清除 require 缓存以确保加载最新模块
- 非活动脚本从文件系统和 require 缓存中删除

## 高级用法

### 自定义轮询间隔

```typescript
// 每 10 秒检查一次更新
await DynaModuleManager.initialize(
  MyScriptLoader,
  './scripts',
  10000  // 10 秒
);

const manager = DynaModuleManager.getInstance();
```

### 实现脚本版本控制

```typescript
class VersionedScriptLoader extends BaseScriptLoader {
  protected async getUpdatedScripts(anchor: Date): Promise<DynaScript[]> {
    const scripts = await this.fetchScripts(anchor);

    return scripts.map(script => ({
      keyCode: `${script.id}-v${script.version}`,
      fileName: `${script.name}-v${script.version}`,
      active: script.active,
      latestUpdated: script.updated_at,
      scriptCode: script.code
    }));
  }
}
```

### 处理脚本导出

你的动态脚本可以使用多种导出方式：

```javascript
// 方式 1: 命名导出
module.exports = {
  execute: function() { /* ... */ },
  config: { /* ... */ }
};

// 方式 2: 默认导出
module.exports = function() { /* ... */ };

// 方式 3: ES6 风格（转译后）
exports.default = class MyPlugin { /* ... */ };
```

然后使用它们：

```typescript
const script = manager.get('my-script');

// 对于命名导出
script.execute();

// 对于默认导出
script();

// 对于 ES6 默认导出
new script.default();
```

## 错误处理

库包含全面的错误处理：

- **时间戳错误**: 如果时间戳文件损坏，回退到 Unix epoch
- **文件操作**: 记录错误并继续操作
- **脚本加载**: 捕获并记录 require() 错误，失败时返回 null
- **并发**: 使用 `isLoading` 标志防止同时进行的加载操作

## 配置要求

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0（用于开发）
- **log4js**: ^6.7.0（可选的 peer dependency）

## 开发

```bash
# 构建库
npm run build

# 类型检查
npm run typecheck

# 清理构建产物
npm run clean

# 发布到 npm
npm run publish-public
```

## 最佳实践

1. **实现错误处理**: 始终处理 `manager.get()` 可能返回的 null
2. **脚本格式**: 确保脚本遵循 Node.js 模块格式
3. **唯一键**: 使用唯一且稳定的 keyCode 值
4. **激活状态**: 正确管理 active 标志以启用/禁用脚本
5. **时间戳**: 确保数据源提供准确的更新时间戳

## 故障排除

### 脚本未加载

- 检查 `getUpdatedScripts()` 返回有效的 DynaScript 对象
- 验证 `scriptCode` 包含有效的 JavaScript
- 检查 log4js 输出的错误消息

### 模块返回 Null

- 确保脚本文件已在 plugins 目录中创建
- 检查脚本代码中的语法错误
- 验证 keyCode 完全匹配

### 热重载无效

- 确认 `pollIntervalMs` 设置恰当
- 验证 `latestUpdated` 时间戳在递增
- 检查 require 缓存是否被清除

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 作者

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## 代码仓库

- GitHub: [https://github.com/ticatec/scripts-loader](https://github.com/ticatec/scripts-loader)
- Issues: [https://github.com/ticatec/scripts-loader/issues](https://github.com/ticatec/scripts-loader/issues)

## 支持

如果这个项目对你有帮助，请考虑：

- ⭐ 在 GitHub 上给项目加星
- 🐛 [报告问题](https://github.com/ticatec/scripts-loader/issues)
- 💖 [赞助项目](https://github.com/sponsors/ticatec)