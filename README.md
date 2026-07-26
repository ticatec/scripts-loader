# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-reliability TypeScript library for dynamic script loading, hot-reloading, and lifecycle management in Node.js. Supports database sync, zero-downtime atomic hot reloading, timestamp cursor persistence, manual/webhook/MQ refresh triggers, and safe module path resolution.

## Features

- ⚡ **Dual Module Support** - Full ES Module (ESM) & CommonJS (CJS) compatibility
- 🚀 **Zero-Downtime Hot Reload** - Atomic write & evaluation via temporary files, preserving existing working modules on syntax errors
- ⏰ **Reliable Timestamp Cursor** - Halts cursor progression safely on batch failures so no failed script is ever skipped
- 🔄 **Polling & Event-Driven Hybrid** - Periodic automatic polling plus `refresh()` manual trigger (e.g. for Webhooks, Redis Pub/Sub, MQ)
- 🛡️ **Boundary Protection** - Path traversal validation restricting output strictly inside `plugins/`
- 🌲 **Structured Logging** - Native integration with `@ticatec/logger-wrapper` (Pino)
- 🧩 **Singleton & Lifecycle Hooks** - `DynaModuleManager` singleton plus `onScriptLoaded` and `afterRemoveModule` callbacks

## Installation

```bash
pnpm add @ticatec/script-loader @ticatec/logger-wrapper pino
# or npm
npm install @ticatec/script-loader @ticatec/logger-wrapper pino
```

---

## 🚀 Real-World Usage Examples

### 1. Basic Setup: Subclass `BaseScriptLoader`

Subclass `BaseScriptLoader` and implement `getUpdatedScripts(anchor)`:

```typescript
import { BaseScriptLoader, DynaScript } from '@ticatec/script-loader';

export class DbScriptLoader extends BaseScriptLoader {
    constructor(scriptHome: string, pollIntervalMs: number = 5000) {
        super(scriptHome, pollIntervalMs);
    }

    /**
     * Query active scripts updated after the anchor timestamp
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
     * Optional hook: Triggered when a script is successfully loaded/updated
     */
    protected onScriptLoaded(script: DynaScript, moduleExports: any): void {
        console.log(`[Plugin Loaded] ${script.keyCode} updated successfully.`);
    }

    /**
     * Optional hook: Triggered when a script is deactivated/removed
     */
    protected afterRemoveModule(keyCode: string, modFile: string): void {
        console.log(`[Plugin Removed] ${keyCode} removed from cache.`);
    }
}
```

---

### 2. Initialize `DynaModuleManager` Singleton

Initialize the singleton at your application entry point:

```typescript
import DynaModuleManager from '@ticatec/script-loader';
import { DbScriptLoader } from './DbScriptLoader.js';

// Concurrent-safe singleton initialization
const manager = await DynaModuleManager.initialize(
    DbScriptLoader,
    './runtime_scripts', // Local plugin cache directory
    5000                 // Polling interval in ms
);

// Fetch loaded module instance
const calcRule = manager.get('order_discount_rule');
if (calcRule) {
    const finalPrice = calcRule.calculateDiscount({ price: 100, userLevel: 'VIP' });
    console.log('Discounted Price:', finalPrice);
}
```

---

### 3. Programmatic / Event-Driven Immediate Reload (Webhook / MQ)

Trigger an immediate reload programmatically via `manager.refresh()` without waiting for the next timer poll:

```typescript
import express from 'express';
import DynaModuleManager from '@ticatec/script-loader';

const app = express();

// Webhook / MQ Endpoint for immediate script reload
app.post('/api/v1/reload-scripts', async (req, res) => {
    try {
        const manager = DynaModuleManager.getInstance();
        
        // Immediately pull and reload updated scripts from DB
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

### 4. Integration with Express / Rule Engine Middleware

Dynamically resolve and execute rules inside Web requests:

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
            req['ruleResult'] = ruleModule.execute(req.body, req['user']);
            next();
        } catch (err) {
            next(err);
        }
    };
}
```

---

## 📖 API Reference

### `DynaScript` Interface

```typescript
interface DynaScript {
    keyCode: string;        // Unique key identifier (e.g. 'discount_rule')
    fileName: string;       // Target file name (e.g. 'discount_rule_v1')
    active: boolean;        // Active flag (false removes local file and cache)
    latestUpdated: Date;    // Last updated timestamp
    scriptCode: string;     // JavaScript / CommonJS source code
}
```

### `DynaModuleManager`

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `initialize(loaderConstructor, ...args)` | `Promise<DynaModuleManager>` | Concurrent-safe singleton initializer |
| `getInstance()` | `DynaModuleManager` | Returns initialized singleton (throws if uninitialized) |
| `get<T>(key: string): T \| null` | `T \| null` | Returns exports of loaded module |
| `refresh(forceAll?: boolean)` | `Promise<DynaScript[]>` | Programmatically triggers immediate script reload |
| `shutdown()` | `void` | Stops polling and clears singleton instance |
| `resetInstance()` | `void` | Resets singleton (unit test helper) |

### `BaseScriptLoader`

| Method / Hook | Visibility | Description |
| :--- | :--- | :--- |
| `getUpdatedScripts(anchor: Date)` | `abstract protected` | Must implement: fetches scripts updated after `anchor` |
| `onScriptLoaded(script, exports)` | `protected` | Hook: called after script is loaded/updated |
| `afterRemoveModule(keyCode, modFile)`| `protected` | Hook: called after script is removed |
| `refresh(forceAll?: boolean)` | `public` | Triggers immediate script reload |
| `stopWatching()` | `public` | Stops polling watcher |

---

## License

MIT License - see `LICENSE`.
