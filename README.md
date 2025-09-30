# @ticatec/script-loader

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful TypeScript dynamic script loading and management library with real-time script updates, caching management, and timestamp persistence.

## Features

- 🚀 **Dynamic Script Loading** - Runtime dynamic loading and updating of JavaScript scripts
- ⏰ **Timestamp Persistence** - Automatically save and restore last update timestamp
- 🔄 **Real-time Updates** - Periodically check for script updates and apply them automatically
- 💾 **Smart Caching** - In-memory caching of script instances for improved performance
- 🔥 **Hot Reload** - Support for script hot reloading without application restart
- 🧩 **Plugin System** - Flexible plugin architecture, easy to extend
- 🛡️ **Error Handling** - Comprehensive error handling and logging
- 🔒 **Concurrency Protection** - Prevent race conditions in duplicate loading operations
- 📝 **TypeScript Support** - Complete type definitions and generic support

## Installation

```bash
npm install @ticatec/script-loader
```

## Quick Start

### Basic Usage

```typescript
import BaseScriptLoader from '@ticatec/script-loader';

// Implement the abstract class
class MyScriptLoader extends BaseScriptLoader<MyScript, MyScriptData> {
  
  // Implement required abstract methods
  protected async getUpdatedScripts(anchor: Date): Promise<MyScriptData[]> {
    // Load script updates from data source after the specified time
    return await fetchScriptsFromDatabase(anchor);
  }

  protected getNextAnchor(list: Array<MyScriptData>): Date {
    // Return the next anchor time
    return new Date(Math.max(...list.map(item => item.updateTime)));
  }

  protected isActiveScript(scriptData: MyScriptData): boolean {
    // Determine if the script is in active state
    return scriptData.status === 'active';
  }

  protected isObsoletedScript(scriptData: MyScriptData): boolean {
    // Determine if the script needs to be deleted
    return scriptData.status === 'deleted';
  }

  protected getFileName(scriptData: MyScriptData): string {
    // Return script filename (without extension)
    return scriptData.name;
  }

  protected getScriptKey(scriptData: MyScriptData): string {
    // Return script's unique identifier
    return scriptData.id;
  }

  protected getScriptText(scriptData: MyScriptData): string {
    // Return script content
    return scriptData.content;
  }
}

// Create script loader instance
const scriptLoader = new MyScriptLoader(
  './scripts',  // Script directory
  5000,        // Check interval (milliseconds)
  false        // Whether to clear directory
);

// Get script instance
const script = scriptLoader.get('script-id');
if (script) {
  // Use script instance
  script.execute();
}
```

### Advanced Configuration

```typescript
// Enable directory cleanup
const scriptLoader = new MyScriptLoader(
  './scripts',
  10000,
  true  // Clear script directory on startup
);

// Manually trigger update check
await scriptLoader.checkForUpdates();

// Stop monitoring
scriptLoader.stopWatching();
```

## API Documentation

### BaseScriptLoader<T, K>

#### Constructor

```typescript
protected constructor(
  scriptDir: string,      // Script storage directory
  pollIntervalMs: number, // Polling interval (milliseconds)
  clean?: boolean         // Whether to clear directory, default false
)
```

#### Public Methods

##### `get(key: string): T | null`

Get script instance by key.

- **Parameters**: `key` - Script's unique identifier key
- **Returns**: Script instance, or `null` if not found

##### `checkForUpdates(): Promise<void>`

Manually trigger script update check, immediately perform one script update check without waiting for timer.

##### `stopWatching(): void`

Stop script update monitoring, clear timer and stop monitoring script changes.

#### Abstract Methods (Must Implement)

##### `getUpdatedScripts(anchor: Date): Promise<Array<any>>`

Get updated script list from the specified anchor time.

- **Parameters**: `anchor` - Anchor time, get script updates after this time
- **Returns**: Promise that resolves to script update list

##### `getNextAnchor(list: Array<any>): Date`

Get the next anchor time.

- **Parameters**: `list` - Script list
- **Returns**: Next anchor time

##### `isActiveScript(scriptData: K): boolean`

Determine if the script is in active state.

- **Parameters**: `scriptData` - Script data
- **Returns**: `true` if script is in active state

##### `isObsoletedScript(scriptData: K): boolean`

Determine if the script is obsolete/needs to be deleted.

- **Parameters**: `scriptData` - Script data
- **Returns**: `true` if script is obsolete and needs deletion

##### `getFileName(scriptData: K): string`

Get script filename.

- **Parameters**: `scriptData` - Script data
- **Returns**: Script filename (without extension)

##### `getScriptKey(scriptData: K): string`

Get script's unique identifier key.

- **Parameters**: `scriptData` - Script data
- **Returns**: Script's unique identifier key

##### `getScriptText(scriptData: K): string`

Get script content text.

- **Parameters**: `scriptData` - Script data
- **Returns**: Script content text

### Type Definitions

#### `ScriptInstance<T, K>`

```typescript
export type ScriptInstance<T, K> = {
  metaData: K;  // Script metadata
  instance: T;  // Script instance
}
```


## How It Works

### Timestamp Management

- Creates `.last_update_timestamp` file in the script directory
- Reads last update time on startup, uses Unix epoch (1970-01-01) if file doesn't exist
- Automatically saves latest timestamp after each script update

### Script Lifecycle

1. **Loading Phase**: Fetch script updates from data source
2. **Processing Phase**: Decide to load/update or delete based on script status
3. **Caching Phase**: Store script instances in memory
4. **Timestamp Update**: Save latest anchor time

### Directory Structure

```
scriptDir/
├── .last_update_timestamp  # Timestamp file
└── plugins/                # Script files directory
    ├── script1.js
    ├── script2.js
    └── ...
```

## Error Handling

The library includes comprehensive error handling mechanisms:

- **Timestamp Parsing Errors**: Automatically use default timestamp
- **File Operation Errors**: Detailed error logging and recovery mechanisms
- **Script Loading Errors**: Validate module exports and constructors
- **Concurrency Conflicts**: Race condition protection to prevent duplicate loading

## Requirements

- **Node.js**: >= 16.0.0
- **TypeScript**: ^5.0.0
- **log4js**: ^6.7.0 (optional peer dependency)

## Development

```bash
# Build project
npm run build

# Type check
npm run typecheck

# Clean build artifacts
npm run clean
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**Henry Feng**
- Email: huili.f@gmail.com
- GitHub: [@ticatec](https://github.com/ticatec)

## Support

If this project helps you, please consider:

- ⭐ Give the project a star
- 🐛 [Report issues](https://github.com/ticatec/scripts-loader/issues)
- 💖 [Sponsor the project](https://github.com/sponsors/ticatec)
