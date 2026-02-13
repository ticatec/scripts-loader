# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个用于 Node.js 的 TypeScript 动态脚本加载库，采用轮询方式更新脚本，支持时间戳持久化和基于文件的模块管理。

## 特性

- 🚀 **动态脚本加载** - 运行时获取脚本并写入本地文件
- ⏰ **时间戳持久化** - 通过 `.last_update_timestamp` 保存/恢复更新时间
- 🔄 **轮询更新** - 定期检查并刷新本地脚本文件
- 💾 **Require 缓存管理** - 脚本变化时清理 Node.js `require` 缓存
- 🧩 **单例管理器** - 通过 `DynaModuleManager` 访问加载器
- 🛡️ **错误处理** - IO 和模块加载失败会记录日志
- 🔒 **并发保护** - 避免更新过程并发执行
- 📝 **TypeScript 支持** - 完整类型定义

## 安装

```bash
npm install @ticatec/script-loader
```

## 快速开始

### 步骤 1：实现 `BaseScriptLoader`

继承 `BaseScriptLoader` 并实现 `getUpdatedScripts` 方法。

```typescript
import { BaseScriptLoader } from '@ticatec/script-loader';
import type { DynaScript } from '@ticatec/script-loader/lib/DynaModuleManager';

class MyScriptLoader extends BaseScriptLoader {
  constructor(scriptHome: string, pollIntervalMs: number) {
    super(scriptHome, pollIntervalMs);
  }

  /**
   * 获取 anchor 之后更新的脚本
   */
  protected async getUpdatedScripts(anchor: Date): Promise<DynaScript[]> {
    const scripts = await db.query(
      'SELECT * FROM scripts WHERE updated_at > ?',
      [anchor]
    );

    return scripts.map(script => ({
      keyCode: script.id,
      fileName: script.name,
      active: script.status === 'active',
      latestUpdated: script.updated_at,
      scriptCode: script.content
    }));
  }
}
```

### 步骤 2：初始化 `DynaModuleManager`

```typescript
import DynaModuleManager from '@ticatec/script-loader';

await DynaModuleManager.initialize(
  MyScriptLoader,
  './scripts',
  5000
);
```

### 步骤 3：使用加载的脚本

```typescript
import DynaModuleManager from '@ticatec/script-loader';

const manager = DynaModuleManager.getInstance();
const myScript = manager.get('script-key-123');

if (myScript) {
  myScript.someFunction?.();
  const result = myScript.default?.();
}
```

## API 文档

### `DynaScript` 接口

```typescript
interface DynaScript {
  keyCode: string;
  fileName: string;
  active: boolean;
  latestUpdated: Date;
  scriptCode: string;
}
```

### `DynaModuleManager`

#### `initialize<Args>(loaderConstructor, ...args): Promise<DynaModuleManager>`

- **参数**:
  - `loaderConstructor` - `BaseScriptLoader` 子类构造函数
  - `...args` - 传递给加载器构造函数的参数（如 `scriptHome`, `pollIntervalMs`）
- **返回**: `DynaModuleManager` 单例实例

#### `getInstance(): DynaModuleManager`

- **返回**: 已初始化的单例实例
- **抛出**: 未调用 `initialize()` 时抛出错误

#### `get(key: string): any | null`

- **返回**: 通过 `require(filePath)` 加载的模块，或 `null`

#### `shutdown(): void`

- 停止轮询定时器

### `CommonScriptManager`

`CommonScriptManager` 是一个轻量级的内存注册表，用于存放共享的脚本实例或对象。

#### 基本用法

```typescript
import CommonScriptManager from '@ticatec/script-loader/lib/CommonScriptManager';

const registry = CommonScriptManager.getInstance();

registry.put('rule:order', {
  validate(order: any) {
    return order.total > 0;
  }
});

const rule = registry.get<{ validate(order: any): boolean }>('rule:order');
if (rule) {
  rule.validate({ total: 10 });
}

registry.remove('rule:order');
```

### `BaseScriptLoader`

#### 构造函数

```typescript
protected constructor(scriptHome: string, pollIntervalMs: number)
```

#### 抽象方法

```typescript
protected abstract getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>;
```

#### 公共方法

- `init(): Promise<void>`
- `getModule(key: string): any | null`
- `stopWatching(): void`

#### 钩子方法

- `protected afterRemoveModule(keyCode: string, modFile: string): void`
  - 可重写，用于脚本移除后的清理逻辑

## 工作原理

### 初始化流程

1. **目录设置**: 确保 `scriptHome/plugins` 存在
2. **时间戳加载**: 读取 `.last_update_timestamp`，不存在则从 Unix epoch 开始
3. **初始加载**: 拉取上次更新时间之后的全部脚本
4. **轮询更新**: 定期获取更新并写入文件

### 目录结构

```
scriptHome/
├── .last_update_timestamp
└── plugins/
    ├── script1.js
    ├── script2.js
    └── ...
```

### 模块缓存行为

- 脚本写入到 `plugins` 目录下的 `.js` 文件
- `getModule()` 通过 Node.js `require()` 加载模块
- 脚本更新时清理对应 `require` 缓存
- 脚本失效时删除文件并清理缓存

## 依赖要求

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0（开发）
- **log4js**: ^6.7.0（可选 peer 依赖）

## 开发

```bash
npm run build
npm run typecheck
npm run clean
npm run publish-public
```

## 最佳实践

1. **处理 `null`**: `manager.get()` 可能返回 `null`
2. **稳定键值**: `keyCode` 需要唯一且稳定
3. **合法脚本**: `scriptCode` 必须是有效的 Node.js 模块
4. **时间戳准确**: 确保 `latestUpdated` 能正确触发更新

## 常见问题

### 脚本未加载

- 确认 `getUpdatedScripts()` 返回正确的 `DynaScript`
- 检查 `scriptCode` 是否为合法 JavaScript
- 查看 log4js 日志定位错误

### 模块返回 `null`

- 检查 `plugins` 目录下是否存在脚本文件
- 检查脚本语法是否正确
- 确认 `keyCode` 是否一致

## 许可证

MIT License - 参见 `LICENSE`。

## 作者

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## 仓库

- GitHub: https://github.com/ticatec/scripts-loader
- Issues: https://github.com/ticatec/scripts-loader/issues

## 支持

- GitHub 点赞
- 反馈问题
- 赞助: https://github.com/sponsors/ticatec
