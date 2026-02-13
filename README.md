# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript library for polling-based dynamic script loading in Node.js, with timestamp persistence and file-based module management.

## Features

- 🚀 **Dynamic Script Loading** - Fetch scripts at runtime and write them to local files
- ⏰ **Timestamp Persistence** - Save and restore last update time via `.last_update_timestamp`
- 🔄 **Polling Updates** - Periodically check for updates and refresh local files
- 💾 **Require Cache Management** - Clear Node.js `require` cache when scripts change
- 🧩 **Singleton Manager** - Access the loader through `DynaModuleManager`
- 🛡️ **Error Handling** - Logged failures for IO and module load errors
- 🔒 **Concurrency Protection** - Avoid overlapping update runs
- 📝 **TypeScript Support** - Type definitions included

## Installation

```bash
npm install @ticatec/script-loader
```

## Quick Start

### Step 1: Implement `BaseScriptLoader`

Create your custom loader by extending `BaseScriptLoader` and implementing `getUpdatedScripts`.

```typescript
import { BaseScriptLoader } from '@ticatec/script-loader';
import type { DynaScript } from '@ticatec/script-loader/lib/DynaModuleManager';

class MyScriptLoader extends BaseScriptLoader {
  constructor(scriptHome: string, pollIntervalMs: number) {
    super(scriptHome, pollIntervalMs);
  }

  /**
   * Fetch scripts updated after the anchor timestamp
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

### Step 2: Initialize `DynaModuleManager`

```typescript
import DynaModuleManager from '@ticatec/script-loader';

await DynaModuleManager.initialize(
  MyScriptLoader,
  './scripts',
  5000
);
```

### Step 3: Use Loaded Scripts

```typescript
import DynaModuleManager from '@ticatec/script-loader';

const manager = DynaModuleManager.getInstance();
const myScript = manager.get('script-key-123');

if (myScript) {
  myScript.someFunction?.();
  const result = myScript.default?.();
}
```

## API Documentation

### `DynaScript` Interface

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

- **Parameters**:
  - `loaderConstructor` - Constructor of your `BaseScriptLoader` subclass
  - `...args` - Passed to the loader constructor (e.g. `scriptHome`, `pollIntervalMs`)
- **Returns**: A `DynaModuleManager` instance (singleton)

#### `getInstance(): DynaModuleManager`

- **Returns**: The initialized singleton instance
- **Throws**: Error if `initialize()` has not been called

#### `get(key: string): any | null`

- **Returns**: The module loaded via `require(filePath)`, or `null` if missing or load fails

#### `shutdown(): void`

- Stops the polling timer

### `CommonScriptManager`

`CommonScriptManager` is a lightweight in-memory registry for shared script instances or objects.

#### Basic Usage

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

#### Constructor

```typescript
protected constructor(scriptHome: string, pollIntervalMs: number)
```

#### Abstract Method

```typescript
protected abstract getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>;
```

#### Public Methods

- `init(): Promise<void>`
- `getModule(key: string): any | null`
- `stopWatching(): void`

#### Hook

- `protected afterRemoveModule(keyCode: string, modFile: string): void`
  - Override if you need cleanup after a module is removed from cache

## How It Works

### Initialization Flow

1. **Directory Setup**: Ensures `scriptHome/plugins` exists
2. **Timestamp Loading**: Reads `.last_update_timestamp` or starts from Unix epoch
3. **Initial Load**: Fetches all scripts updated since the last timestamp
4. **Polling**: Periodically fetches updates and writes files

### Directory Structure

```
scriptHome/
├── .last_update_timestamp
└── plugins/
    ├── script1.js
    ├── script2.js
    └── ...
```

### Module Caching Behavior

- Scripts are written as `.js` files under `plugins`
- `getModule()` loads modules via Node.js `require()`
- When a script is updated, its `require` cache entry is cleared
- When a script is inactive, the file is deleted and cache is cleared

## Requirements

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0 (development)
- **log4js**: ^6.7.0 (optional peer dependency)

## Development

```bash
npm run build
npm run typecheck
npm run clean
npm run publish-public
```

## Best Practices

1. **Handle `null`**: `manager.get()` can return `null` if load fails
2. **Stable Keys**: Use unique and stable `keyCode` values
3. **Valid JS**: Ensure `scriptCode` is valid Node.js module syntax
4. **Timestamps**: Provide accurate `latestUpdated` values to avoid missing updates

## Troubleshooting

### Scripts Not Loading

- Confirm `getUpdatedScripts()` returns valid `DynaScript` objects
- Verify `scriptCode` contains valid JavaScript
- Check log4js output for errors

### Module Returns `null`

- Verify the file exists under `plugins`
- Check for syntax errors in script code
- Ensure the keyCode matches exactly

## License

MIT License - see `LICENSE`.

## Author

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## Repository

- GitHub: https://github.com/ticatec/scripts-loader
- Issues: https://github.com/ticatec/scripts-loader/issues

## Support

- Star the project on GitHub
- Report issues on GitHub
- Sponsor: https://github.com/sponsors/ticatec
