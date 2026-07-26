# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个专为 Node.js 打造的高可靠 TypeScript 动态脚本加载与生命周期管理库。支持数据库/远程存储同步、原子化零停机热更新（Zero-Downtime Hot Reload）、时间戳游标持久化、手动/MQ/Webhook 即时触发更新以及安全的模块作用域解析。

## 特性

- ⚡ **双模式模块支持** - 完整支持 ES Modules (ESM) 与 CommonJS (CJS)
- 🚀 **零停机热更新 (Atomic Hot Reload)** - 写入临时文件验证语法与求值成功后原子替换，更新失败保留旧可用版本
- ⏰ **时间戳游标可靠推进** - 脚本批量同步故障时自动暂停游标，防止同一时间戳下的失败脚本被越过
- 🔄 **轮询与事件驱动双轮驱动** - 支持定时自动轮询与 `refresh()` 主动即时触发（如结合 Redis Pub/Sub、MQ 或 Webhook）
- 🛡️ **边界安全防护** - 路径防穿越校验，严格限制在 `plugins/` 目录以内
- 🌲 **结构化日志集成** - 整合 `@ticatec/logger-wrapper` 与 Pino 日志库
- 🧩 **单例与生命周期钩子** - 提供 `DynaModuleManager` 单例及 `onScriptLoaded` / `afterRemoveModule` 回调

## 安装

```bash
pnpm add @ticatec/script-loader @ticatec/logger-wrapper pino
# 或 npm
npm install @ticatec/script-loader @ticatec/logger-wrapper pino
```

---

## 🚀 核心使用案例

### 1. 基础用法：继承 `BaseScriptLoader`

底层继承 `BaseScriptLoader` 并实现 `getUpdatedScripts(anchor)` 方法：

```typescript
import { BaseScriptLoader, DynaScript } from '@ticatec/script-loader';

export class DbScriptLoader extends BaseScriptLoader {
    constructor(scriptHome: string, pollIntervalMs: number = 5000) {
        super(scriptHome, pollIntervalMs);
    }

    /**
     * 查询 anchor 时间之后有更新的活动脚本
     */
    protected async getUpdatedScripts(anchor: Date): Promise<DynaScript[]> {
        const rows = await db.query(
            'SELECT key_code, file_name, is_active, updated_at, script_code FROM sys_dynamic_scripts WHERE updated_at > $1',
            [anchor]
        );

        return rows.map(r => ({
            keyCode: r.key_code,
            fileName: r.file_name,
            active: r.is_active,
            latestUpdated: new Date(r.updated_at),
            scriptCode: r.script_code
        }));
    }

    /**
     * 可选钩子：脚本成功加载/更新后触发
     */
    protected onScriptLoaded(script: DynaScript, moduleExports: any): void {
        console.log(`[Plugin Loaded] ${script.keyCode} updated successfully.`);
    }

    /**
     * 可选钩子：脚本被注销/移除后触发
     */
    protected afterRemoveModule(keyCode: string, modFile: string): void {
        console.log(`[Plugin Removed] ${keyCode} removed from cache.`);
    }
}
```

---

### 2. 初始化 `DynaModuleManager` 单例

在应用启动入口初始化单例：

```typescript
import DynaModuleManager from '@ticatec/script-loader';
import { DbScriptLoader } from './DbScriptLoader.js';

// 初始化单例（并发安全）
const manager = await DynaModuleManager.initialize(
    DbScriptLoader,
    './runtime_scripts', // 本地脚本缓存根目录
    5000                 // 自动轮询间隔 (ms)
);

// 获取加载的脚本模块
const calcRule = manager.get('order_discount_rule');
if (calcRule) {
    const finalPrice = calcRule.calculateDiscount({ price: 100, userLevel: 'VIP' });
    console.log('Discounted Price:', finalPrice);
}
```

---

### 3. 主动触发即时更新（Webhook / MQ 消息驱动）

除了等待轮询间隔外，当收到 Webhook、MQ 消息或管理员 API 请求时，可调用 `manager.refresh()` 立即同步最新脚本：

```typescript
import express from 'express';
import DynaModuleManager from '@ticatec/script-loader';

const app = express();

// 接收 MQ 消息或 Webhook 通知
app.post('/api/v1/reload-scripts', async (req, res) => {
    try {
        const manager = DynaModuleManager.getInstance();
        
        // 即时同步数据库最新脚本（不等待 5 秒轮询）
        const updatedScripts = await manager.refresh();
        
        res.json({
            success: true,
            updatedCount: updatedScripts.length,
            scripts: updatedScripts.map(s => s.keyCode)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});
```

---

### 4. 结合规则引擎与 Express 中间件

在 API 中动态路由与求值：

```typescript
import { Request, Response, NextFunction } from 'express';
import DynaModuleManager from '@ticatec/script-loader';

export function dynamicRuleMiddleware(ruleKey: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const manager = DynaModuleManager.getInstance();
        const ruleModule = manager.get(ruleKey);

        if (!ruleModule) {
            return res.status(503).json({ error: `Dynamic rule '${ruleKey}' is not active` });
        }

        try {
            // 执行动态规则逻辑
            req['ruleResult'] = ruleModule.execute(req.body, req['user']);
            next();
        } catch (err) {
            next(err);
        }
    };
}
```

---

## 📖 API 参考指南

### `DynaScript` 接口

```typescript
interface DynaScript {
    keyCode: string;        // 脚本唯一键 (如 'discount_rule')
    fileName: string;       // 生成的 JS 文件名 (如 'discount_rule_v1')
    active: boolean;        // 是否启用 (false 会自动清理本地文件与缓存)
    latestUpdated: Date;    // 脚本最后更新时间
    scriptCode: string;     // 脚本的 JavaScript / CommonJS 源代码
}
```

### `DynaModuleManager`

| 方法 | 返回类型 | 说明 |
| :--- | :--- | :--- |
| `initialize(loaderConstructor, ...args)` | `Promise<DynaModuleManager>` | 并发安全初始化单例 |
| `getInstance()` | `DynaModuleManager` | 获取已初始化的单例（未初始化抛错） |
| `get<T>(key: string): T \| null` | `T \| null` | 获取动态加载的模块导出对象 |
| `refresh(forceAll?: boolean)` | `Promise<DynaScript[]>` | 主动即时重载脚本并返回更新列表 |
| `shutdown()` | `void` | 停止轮询监控并销毁单例引用 |
| `resetInstance()` | `void` | 重置单例状态（测试套件专用） |

### `BaseScriptLoader`

| 方法 / 钩子 | 访问限定 | 说明 |
| :--- | :--- | :--- |
| `getUpdatedScripts(anchor: Date)` | `abstract protected` | 必须实现：拉取 `anchor` 后的更新列表 |
| `onScriptLoaded(script, exports)` | `protected` | 钩子：脚本成功加载/原子更新后回调 |
| `afterRemoveModule(keyCode, modFile)`| `protected` | 钩子：脚本注销/移除后回调 |
| `refresh(forceAll?: boolean)` | `public` | 主动重载脚本 |
| `stopWatching()` | `public` | 停止定时器轮询 |

---

## 🔒 安全与注意细节

1. **绝对路径与作用域绑定**:
   - 动态脚本中的 `require('./helper')` 与 `__filename` 会根据插件正式目标路径解析，支持相对路径依赖加载。
2. **顶层副作用说明**:
   - 脚本求值时会在临时文件验证无误后原子替换正式文件。建议脚本顶层代码尽量保持幂等，避免在顶层直接开启不便销毁的全局长连接。
3. **并发安全**:
   - `DynaModuleManager.initialize()` 具备内部互斥锁，支持多处并发调用。

---

## 许可证

MIT License - 详见 `LICENSE`。
