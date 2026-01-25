# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful TypeScript dynamic script loading and management library with real-time script updates, caching management, and timestamp persistence.

## Features

- 🚀 **Dynamic Script Loading** - Runtime dynamic loading and updating of JavaScript scripts
- ⏰ **Timestamp Persistence** - Automatically save and restore last update timestamp
- 🔄 **Real-time Updates** - Periodically check for script updates and apply them automatically
- 💾 **Smart Caching** - In-memory caching of script modules with require cache management
- 🔥 **Hot Reload** - Support for script hot reloading without application restart
- 🧩 **Singleton Manager** - Centralized script management with DynaModuleManager
- 🛡️ **Error Handling** - Comprehensive error handling and logging with log4js
- 🔒 **Concurrency Protection** - Prevent race conditions in duplicate loading operations
- 📝 **TypeScript Support** - Complete type definitions and interfaces

## Installation

```bash
npm install @ticatec/script-loader
```

## Quick Start

### Step 1: Implement BaseScriptLoader

Create your custom script loader by extending `BaseScriptLoader` and implementing the `getUpdatedScripts` method:

```typescript
import { BaseScriptLoader } from '@ticatec/script-loader';
import type { DynaScript } from '@ticatec/script-loader/lib/DynaModuleManager';

class MyScriptLoader extends BaseScriptLoader {

  /**
   * Fetch updated scripts from your data source
   * @param anchor - Get scripts updated after this timestamp
   * @returns Array of DynaScript objects
   */
  protected async getUpdatedScripts(anchor: Date): Promise<DynaScript[]> {
    // Example: Fetch from database
    const scripts = await db.query(
      'SELECT * FROM scripts WHERE updated_at > ?',
      [anchor]
    );

    return scripts.map(script => ({
      keyCode: script.id,           // Unique identifier
      fileName: script.name,         // Filename without extension
      active: script.status === 'active',
      latestUpdated: script.updated_at,
      scriptCode: script.content     // JavaScript code
    }));
  }
}
```

### Step 2: Initialize the DynaModuleManager

```typescript
import DynaModuleManager from '@ticatec/script-loader';

// Initialize the singleton manager
await DynaModuleManager.initialize(
  MyScriptLoader,           // Your loader class
  './scripts',              // Script storage directory
  5000                      // Poll interval in milliseconds
);
```

### Step 3: Use Loaded Scripts

```typescript
import DynaModuleManager from '@ticatec/script-loader';

// Get the initialized manager instance
const manager = DynaModuleManager.getInstance();

// Get a script module by its keyCode
const myScript = manager.get('script-key-123');

if (myScript) {
  // Use the loaded module
  // If your script exports functions/classes, use them directly
  myScript.someFunction();

  // Or if it exports default
  const result = myScript.default();
}
```

## API Documentation

### DynaScript Interface

The `DynaScript` interface defines the structure for script metadata:

```typescript
interface DynaScript {
  keyCode: string;        // Unique identifier for the script
  fileName: string;       // Script filename (without .js extension)
  active: boolean;        // Whether the script is active
  latestUpdated: Date;    // Last update timestamp
  scriptCode: string;     // JavaScript code content
}
```

### DynaModuleManager

#### Static Methods

##### `initialize<Args>(loaderConstructor, ...args): Promise<DynaModuleManager>`

Initialize the singleton instance of DynaModuleManager. This method must be called before using `getInstance()`.

- **Parameters**:
  - `loaderConstructor` - Constructor of your BaseScriptLoader subclass
  - `...args` - Arguments to pass to the loader constructor (typically scriptDir and pollIntervalMs)
- **Returns**: Promise that resolves to the DynaModuleManager instance
- **Example**:
  ```typescript
  await DynaModuleManager.initialize(MyScriptLoader, './scripts', 5000);
  ```

##### `getInstance(): DynaModuleManager`

Get the singleton instance of DynaModuleManager. Throws an error if not initialized.

- **Returns**: The DynaModuleManager instance
- **Throws**: Error if `initialize()` hasn't been called yet
- **Example**:
  ```typescript
  const manager = DynaModuleManager.getInstance();
  ```

#### Instance Methods

##### `get(key: string): any | null`

Retrieve a loaded script module by its keyCode.

- **Parameters**: `key` - Script's unique identifier (keyCode)
- **Returns**: The loaded module, or `null` if not found

### BaseScriptLoader

#### Constructor

```typescript
protected constructor(
  scriptHome: string,      // Script storage directory
  pollIntervalMs: number   // Polling interval in milliseconds
)
```

#### Abstract Method (Must Implement)

##### `getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>`

Fetch updated scripts from your data source.

- **Parameters**: `anchor` - Timestamp to fetch scripts updated after this time
- **Returns**: Promise resolving to an array of DynaScript objects

#### Public Methods

##### `init(): Promise<void>`

Initialize the script loader. This is called automatically by DynaModuleManager.

##### `getModule(key: string): any | null`

Get a loaded module by its keyCode.

- **Parameters**: `key` - Script's unique identifier
- **Returns**: The loaded module, or `null` if not found

##### `stopWatching(): void`

Stop the periodic script update monitoring.

## How It Works

### Initialization Flow

1. **Directory Setup**: Creates `plugins` directory under `scriptHome`
2. **Timestamp Loading**: Reads `.last_update_timestamp` file or starts from Unix epoch
3. **Initial Load**: Fetches and loads all scripts updated since the last timestamp
4. **Watch Start**: Begins periodic polling for script updates

### Script Lifecycle

```
┌─────────────────┐
│  getUpdatedScripts  │
│  (from your DB/API) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Process Scripts    │
│  • active=true      │──► Write to file & cache module
│  • active=false     │──► Delete file & clear cache
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update Timestamp    │
│ Save to .last_      │
│ update_timestamp    │
└─────────────────┘
```

### Directory Structure

```
scriptHome/
├── .last_update_timestamp    # Timestamp persistence file
└── plugins/                  # Script files directory
    ├── script1.js
    ├── script2.js
    └── ...
```

### Module Caching

- Scripts are written as `.js` files in the `plugins` directory
- Modules are loaded using Node.js `require()`
- Require cache is cleared before reloading to ensure fresh module load
- Inactive scripts are removed from both filesystem and require cache

## Advanced Usage

### Custom Polling Interval

```typescript
// Check for updates every 10 seconds
await DynaModuleManager.initialize(
  MyScriptLoader,
  './scripts',
  10000  // 10 seconds
);

const manager = DynaModuleManager.getInstance();
```

### Implementing Script Versioning

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

### Handling Script Exports

Your dynamic scripts can export in various ways:

```javascript
// Option 1: Named exports
module.exports = {
  execute: function() { /* ... */ },
  config: { /* ... */ }
};

// Option 2: Default export
module.exports = function() { /* ... */ };

// Option 3: ES6-style (transpiled)
exports.default = class MyPlugin { /* ... */ };
```

Then use them:

```typescript
const script = manager.get('my-script');

// For named exports
script.execute();

// For default export
script();

// For ES6 default
new script.default();
```

## Error Handling

The library includes comprehensive error handling:

- **Timestamp Errors**: Falls back to Unix epoch if timestamp file is corrupted
- **File Operations**: Logs errors and continues operation
- **Script Loading**: Catches and logs require() errors, returns null on failure
- **Concurrency**: Prevents simultaneous loading operations with `isLoading` flag

## Requirements

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0 (for development)
- **log4js**: ^6.7.0 (optional peer dependency)

## Development

```bash
# Build the library
npm run build

# Type checking
npm run typecheck

# Clean build artifacts
npm run clean

# Publish to npm
npm run publish-public
```

## Best Practices

1. **Implement Error Handling**: Always handle potential null returns from `manager.get()`
2. **Script Format**: Ensure your scripts follow Node.js module format
3. **Unique Keys**: Use unique and stable keyCode values
4. **Active Status**: Properly manage the active flag to enable/disable scripts
5. **Timestamps**: Ensure your data source provides accurate update timestamps

## Troubleshooting

### Scripts Not Loading

- Check that `getUpdatedScripts()` returns valid DynaScript objects
- Verify `scriptCode` contains valid JavaScript
- Check log4js output for error messages

### Module Returns Null

- Ensure the script file was created in the plugins directory
- Check for syntax errors in your script code
- Verify the keyCode matches exactly

### Hot Reload Not Working

- Confirm `pollIntervalMs` is set appropriately
- Verify `latestUpdated` timestamps are increasing
- Check that require cache is being cleared

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## Repository

- GitHub: [https://github.com/ticatec/scripts-loader](https://github.com/ticatec/scripts-loader)
- Issues: [https://github.com/ticatec/scripts-loader/issues](https://github.com/ticatec/scripts-loader/issues)

## Support

If this project helps you, please consider:

- ⭐ Star the project on GitHub
- 🐛 [Report issues](https://github.com/ticatec/scripts-loader/issues)
- 💖 [Sponsor the project](https://github.com/sponsors/ticatec)