# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个强大的 TypeScript 动态脚本加载和管理库，支持实时脚本更新、缓存管理和时间戳持久化。

## 特性

- 🚀 **动态脚本加载** - 运行时动态加载和更新 JavaScript 脚本
- ⏰ **时间戳持久化** - 自动保存和恢复上次更新时间点
- 🔄 **实时更新** - 定时检查脚本更新并自动应用
- 💾 **智能缓存** - 内存缓存脚本实例，提高性能
- 🔥 **热重载** - 支持脚本热重载，无需重启应用
- 🧩 **插件系统** - 灵活的插件架构，易于扩展
- 🛡️ **错误处理** - 完善的错误处理和日志记录
- 🔒 **并发保护** - 防止重复加载操作的竞态条件
- 📝 **TypeScript 支持** - 完整的类型定义和泛型支持

## 安装

```bash
npm install @ticatec/script-loader
```

## 快速开始

### 基本使用

```typescript
import BaseScriptLoader from '@ticatec/script-loader';

// 实现抽象类
class MyScriptLoader extends BaseScriptLoader<MyScript, MyScriptData> {
  
  // 实现必需的抽象方法
  protected async getUpdatedScripts(anchor: Date): Promise<MyScriptData[]> {
    // 从数据源加载指定时间之后的脚本更新
    return await fetchScriptsFromDatabase(anchor);
  }

  protected getNextAnchor(list: Array<MyScriptData>): Date {
    // 返回下一个锚点时间
    return new Date(Math.max(...list.map(item => item.updateTime)));
  }

  protected isActiveScript(scriptData: MyScriptData): boolean {
    // 判断脚本是否为活动状态
    return scriptData.status === 'active';
  }

  protected isObsoletedScript(scriptData: MyScriptData): boolean {
    // 判断脚本是否需要删除
    return scriptData.status === 'deleted';
  }

  protected getFileName(scriptData: MyScriptData): string {
    // 返回脚本文件名（不含扩展名）
    return scriptData.name;
  }

  protected getScriptKey(scriptData: MyScriptData): string {
    // 返回脚本的唯一标识
    return scriptData.id;
  }

  protected getScriptText(scriptData: MyScriptData): string {
    // 返回脚本内容
    return scriptData.content;
  }
}

// 创建脚本加载器实例
const scriptLoader = new MyScriptLoader(
  './scripts',  // 脚本目录
  5000,        // 检查间隔（毫秒）
  false        // 是否清空目录
);

// 获取脚本实例
const script = scriptLoader.get('script-id');
if (script) {
  // 使用脚本实例
  script.execute();
}
```

### 高级配置

```typescript
// 启用目录清理
const scriptLoader = new MyScriptLoader(
  './scripts',
  10000,
  true  // 启动时清空脚本目录
);

// 手动触发更新检查
await scriptLoader.checkForUpdates();

// 停止监控
scriptLoader.stopWatching();
```

## API 文档

### BaseScriptLoader<T, K>

#### 构造函数

```typescript
protected constructor(
  scriptDir: string,      // 脚本存储目录
  pollIntervalMs: number, // 轮询间隔（毫秒）
  clean?: boolean         // 是否清空目录，默认 false
)
```

#### 公共方法

##### `get(key: string): T | null`

根据键获取脚本实例。

- **参数**: `key` - 脚本的唯一标识键
- **返回**: 脚本实例，如果不存在返回 `null`

##### `checkForUpdates(): Promise<void>`

手动触发脚本更新检查，立即执行一次脚本更新检查，不等待定时器。

##### `stopWatching(): void`

停止脚本更新监控，清理定时器并停止对脚本变化的监控。

#### 抽象方法（需要实现）

##### `getUpdatedScripts(anchor: Date): Promise<Array<any>>`

获取从指定锚点时间之后的更新脚本列表。

- **参数**: `anchor` - 锚点时间，获取此时间之后的脚本更新
- **返回**: 返回脚本更新列表的 Promise

##### `getNextAnchor(list: Array<any>): Date`

获取下一个锚点时间。

- **参数**: `list` - 脚本列表
- **返回**: 下一个锚点时间

##### `isActiveScript(scriptData: K): boolean`

判断脚本是否为活动状态。

- **参数**: `scriptData` - 脚本数据
- **返回**: 如果脚本处于活动状态返回 `true`

##### `isObsoletedScript(scriptData: K): boolean`

判断脚本是否已过时/需要删除。

- **参数**: `scriptData` - 脚本数据
- **返回**: 如果脚本已过时需要删除返回 `true`

##### `getFileName(scriptData: K): string`

获取脚本文件名。

- **参数**: `scriptData` - 脚本数据
- **返回**: 脚本文件名（不包含扩展名）

##### `getScriptKey(scriptData: K): string`

获取脚本的唯一标识键。

- **参数**: `scriptData` - 脚本数据
- **返回**: 脚本的唯一标识键

##### `getScriptText(scriptData: K): string`

获取脚本内容文本。

- **参数**: `scriptData` - 脚本数据
- **返回**: 脚本内容文本

### 类型定义

#### `ScriptInstance<T, K>`

```typescript
export type ScriptInstance<T, K> = {
  metaData: K;  // 脚本元数据
  instance: T;  // 脚本实例
}
```


## 工作原理

### 时间戳管理

- 在脚本目录下创建 `.last_update_timestamp` 文件
- 启动时读取上次更新时间，如果文件不存在则使用 Unix epoch (1970-01-01)
- 每次脚本更新后自动保存最新时间戳

### 脚本生命周期

1. **加载阶段**: 从数据源获取脚本更新
2. **处理阶段**: 根据脚本状态决定加载/更新或删除
3. **缓存阶段**: 将脚本实例存储在内存中
4. **时间戳更新**: 保存最新的锚点时间

### 目录结构

```
scriptDir/
├── .last_update_timestamp  # 时间戳文件
└── plugins/                # 脚本文件目录
    ├── script1.js
    ├── script2.js
    └── ...
```

## 错误处理

库内置了完善的错误处理机制：

- **时间戳解析错误**: 自动使用默认时间戳
- **文件操作错误**: 详细的错误日志和恢复机制
- **脚本加载错误**: 验证模块导出和构造函数
- **并发冲突**: 防止重复加载的竞态条件保护

## 配置要求

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0
- **log4js**: ^6.7.0 (可选的 peer dependency)

## 开发

```bash
# 构建项目
npm run build

# 类型检查
npm run typecheck

# 清理构建产物
npm run clean
```

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 作者

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## 支持

如果这个项目对你有帮助，请考虑：

- ⭐ 给项目点个星
- 🐛 [报告问题](https://github.com/ticatec/scripts-loader/issues)
- 💖 [赞助项目](https://github.com/sponsors/ticatec)
