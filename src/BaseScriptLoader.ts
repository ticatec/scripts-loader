import * as fs from 'fs';
import { getLogger, Logger } from "@ticatec/logger-wrapper";
import { DynaScript } from "./DynaModuleManager.js";
import path from "path";
import { createRequire } from "module";

export default abstract class BaseScriptLoader {

    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }
    private readonly scriptHome: string;
    private watchInterval: NodeJS.Timeout | null = null;
    private anchor: Date;
    private readonly pollIntervalMs: number;
    private readonly timestampFile: string;
    private isLoading: boolean = false;
    private flexiFiles: Map<string, string>;
    private moduleInstances: Map<string, any>;

    /**
     * Constructor
     * @param scriptHome Root path where scripts are stored
     * @param pollIntervalMs Poll interval in milliseconds (minimum 100ms)
     * @protected
     */
    protected constructor(scriptHome: string, pollIntervalMs: number) {
        this.scriptHome = path.resolve(scriptHome);
        this.timestampFile = path.join(this.scriptHome, '.last_update_timestamp');
        this.logger.debug(`Created script loader, home path:${this.scriptHome}`);
        
        // Validate pollIntervalMs with minimum threshold
        const MIN_POLL_INTERVAL_MS = 100;
        this.pollIntervalMs = (typeof pollIntervalMs === 'number' && !isNaN(pollIntervalMs) && pollIntervalMs >= MIN_POLL_INTERVAL_MS)
            ? pollIntervalMs
            : 1000;

        this.flexiFiles = new Map<string, string>();
        this.moduleInstances = new Map<string, any>();
        this.anchor = new Date(0);
    }

    /**
     * Universal CJS/ESM require provider scoped to specific script file
     */
    private getRequire(targetFilePath: string): NodeRequire {
        return createRequire(path.resolve(targetFilePath));
    }

    /**
     * Safely resolve script file path within plugins directory boundary
     */
    private getScriptFilePath(fileName: string): string {
        const pluginsDir = path.resolve(this.scriptHome, 'plugins');
        const safePath = path.resolve(pluginsDir, `${fileName}.js`);
        const normalizedPluginsDir = pluginsDir.endsWith(path.sep) ? pluginsDir : pluginsDir + path.sep;
        if (!safePath.startsWith(normalizedPluginsDir)) {
            throw new Error(`Invalid script fileName '${fileName}': Path traversal outside plugins directory is not allowed.`);
        }
        return safePath;
    }

    /**
     * Fetch scripts updated after anchor timestamp
     * @param anchor Anchor timestamp
     */
    protected abstract getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>;

    /**
     * Programmatically trigger an immediate reload of scripts
     * @param forceAll If true, re-fetches and rewrites all active scripts regardless of timestamp
     */
    public async refresh(forceAll: boolean = false): Promise<Array<DynaScript>> {
        this.logger.debug(`Manual refresh triggered (forceAll: ${forceAll})`);
        return await this.loadLatestScripts(forceAll);
    }

    /**
     * Load latest script updates since anchor timestamp
     * Processes scripts in ascending order and advances anchor timestamp safely
     */
    private async loadLatestScripts(loadAll: boolean = false): Promise<Array<DynaScript>> {
        if (this.isLoading) {
            this.logger.debug('Script loading already in progress, skipping...');
            return [];
        }
        this.isLoading = true;
        const processedScripts: Array<DynaScript> = [];
        try {
            const rawList = await this.getUpdatedScripts(loadAll ? new Date(0) : this.anchor);
            if (rawList && rawList.length > 0) {
                // Sort ascending by latestUpdated time
                const scriptList = [...rawList].sort((a, b) => a.latestUpdated.getTime() - b.latestUpdated.getTime());
                
                let failedTimeCutoff: number | null = null;

                for (const item of scriptList) {
                    try {
                        const shouldRewrite = loadAll || item.latestUpdated.getTime() > this.anchor.getTime();
                        await this.processScriptUpdate(item, shouldRewrite);
                        processedScripts.push(item);
                    } catch (error) {
                        this.logger.error({ error, keyCode: item.keyCode }, `Failed to process script update for ${item.keyCode}. Halting cursor progression.`);
                        failedTimeCutoff = item.latestUpdated.getTime();
                        break;
                    }
                }

                // Compute safe timestamp to advance anchor
                let maxSafeTime = this.anchor.getTime();
                for (const item of processedScripts) {
                    const itemTime = item.latestUpdated.getTime();
                    if (failedTimeCutoff != null && itemTime >= failedTimeCutoff) {
                        // Exclude any timestamp equal to or greater than the failing timestamp
                        break;
                    }
                    if (itemTime > maxSafeTime) {
                        maxSafeTime = itemTime;
                    }
                }

                if (maxSafeTime > this.anchor.getTime()) {
                    this.saveLastUpdateTimestamp(new Date(maxSafeTime));
                }
            }
        } catch (error) {
            this.logger.error({ error }, 'Error loading latest scripts:');
        } finally {
            this.isLoading = false;
        }
        return processedScripts;
    }

    private evaluateModule(filePath: string, targetOfficialPath?: string): any {
        const officialPath = targetOfficialPath || filePath;
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            const scriptModule = { exports: {} };
            const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', code);
            fn(scriptModule.exports, this.getRequire(officialPath), scriptModule, officialPath, path.dirname(officialPath));
            return scriptModule.exports;
        } catch (ex) {
            this.logger.error({ ex }, `Failed to evaluate script at ${officialPath}:`);
            return null;
        }
    }

    private clearRequireCache(keyCode: string, filePath: string): void {
        this.moduleInstances.delete(keyCode);
        try {
            const req = this.getRequire(filePath);
            const absPath = path.resolve(filePath);
            if (req.cache) {
                delete req.cache[absPath];
                delete req.cache[filePath];
            }
            this.logger.debug(`Require cache cleared for: ${filePath}`);
        } catch {
            // Ignore cache clear error
        }
    }

    /**
     * Remove script file and clear cache
     */
    private async removeScriptFile(filePath: string): Promise<void> {
        if (await fs.promises.access(filePath).then(() => true).catch(() => false)) {
            await fs.promises.unlink(filePath);
            this.logger.info(`Script file deleted: ${filePath}`);
        } else {
            this.logger.info(`Script file not found: ${filePath}`);
        }
    }

    async init(): Promise<void> {
        this.ensurePluginsDirectory('plugins');
        this.anchor = this.loadLastUpdateTimestamp();
        await this.loadLatestScripts(true);
        this.startWatching();
    }

    /**
     * Load timestamp from file or fallback to Unix epoch
     */
    private loadLastUpdateTimestamp(): Date {
        try {
            if (fs.existsSync(this.timestampFile)) {
                const timestamp = fs.readFileSync(this.timestampFile, 'utf8').trim();
                const timestampNum = parseInt(timestamp, 10);
                if (!isNaN(timestampNum) && timestampNum > 0) {
                    const date = new Date(timestampNum);
                    this.logger.debug(`Loaded timestamp: ${date.toISOString()}`);
                    return date;
                } else {
                    this.logger.warn(`Invalid timestamp format: ${timestamp}`);
                }
            }
        } catch (error) {
            this.logger.error({ error }, 'Failed to read timestamp file:');
        }
        this.logger.debug('Using default timestamp: Unix epoch (1970-01-01)');
        return new Date(0);
    }

    /**
     * Save timestamp atomically to file and update memory anchor upon success
     */
    private saveLastUpdateTimestamp(newAnchor: Date): void {
        const tmpPath = `${this.timestampFile}.tmp.${Date.now()}`;
        try {
            fs.writeFileSync(tmpPath, newAnchor.getTime().toString(), 'utf8');
            fs.renameSync(tmpPath, this.timestampFile);
            this.anchor = newAnchor;
            this.logger.debug(`Saved timestamp: ${this.anchor.toISOString()}`);
        } catch (error) {
            if (fs.existsSync(tmpPath)) {
                try {
                    fs.unlinkSync(tmpPath);
                } catch {
                    // Ignore temp file cleanup error
                }
            }
            this.logger.error({ error }, 'Failed to save timestamp file:');
            throw error;
        }
    }

    /**
     * Ensure plugins directory exists
     */
    private ensurePluginsDirectory(directory: string): void {
        const dir = path.resolve(this.scriptHome, directory);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            this.logger.info(`Created plugins directory: ${dir}`);
        }
    }

    /**
     * Process script update item
     */
    private async processScriptUpdate(item: DynaScript, rewrite: boolean): Promise<void> {
        if (item.active) {
            await this.loadOrUpdateScript(item, rewrite);
        } else {
            await this.removeScript(item);
        }
    }

    /**
     * Load or update script file and instance safely (atomic zero-downtime hot reload)
     */
    private async loadOrUpdateScript(item: DynaScript, rewrite: boolean): Promise<void> {
        const filePath = this.getScriptFilePath(item.fileName);
        const fileExists = fs.existsSync(filePath);
        const shouldRewrite = rewrite || !fileExists;

        if (shouldRewrite) {
            // Atomic update: Write and evaluate in temp file first
            const tmpFilePath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
            try {
                await this.writeScriptFile(tmpFilePath, item.scriptCode);
                const tmpExports = this.evaluateModule(tmpFilePath, filePath);
                if (!tmpExports) {
                    throw new Error(`Failed to evaluate script module for '${item.keyCode}' at ${tmpFilePath}`);
                }

                // Evaluation succeeded! Rename atomically to overwrite official script file
                await fs.promises.rename(tmpFilePath, filePath);
                
                // Clear old require cache & invoke old module cleanup BEFORE setting new moduleInstance
                this.clearRequireCache(item.keyCode, filePath);
                this.afterRemoveModule(item.keyCode, filePath);

                // Set new exports into moduleInstances and flexiFiles
                this.flexiFiles.set(item.keyCode, filePath);
                this.moduleInstances.set(item.keyCode, tmpExports);
                this.onScriptLoaded(item, tmpExports);
                this.logger.info(`Script file ${!fileExists ? 'created' : 'updated'} atomically: ${filePath}`);
            } catch (err) {
                if (fs.existsSync(tmpFilePath)) {
                    await fs.promises.unlink(tmpFilePath).catch(() => {});
                }
                throw err;
            }
        } else {
            this.flexiFiles.set(item.keyCode, filePath);
            const modExports = this.evaluateModule(filePath);
            if (modExports) {
                this.moduleInstances.set(item.keyCode, modExports);
                this.onScriptLoaded(item, modExports);
            } else {
                throw new Error(`Failed to evaluate module for key '${item.keyCode}' at ${filePath}`);
            }
        }
    }

    /**
     * Remove script
     */
    private async removeScript(item: DynaScript): Promise<void> {
        const filePath = this.getScriptFilePath(item.fileName);
        await this.removeScriptFile(filePath);
        this.flexiFiles.delete(item.keyCode);
        this.clearRequireCache(item.keyCode, filePath);
        this.afterRemoveModule(item.keyCode, filePath);
    }

    /**
     * Write script content to file
     */
    private async writeScriptFile(filePath: string, script: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.writeFile(filePath, script, 'utf8', (err) => {
                if (err) {
                    reject(new Error(`Failed to write script file ${filePath}: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Start watching for script updates
     */
    protected startWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
        }
        this.watchInterval = setInterval(async () => {
            try {
                await this.loadLatestScripts();
            } catch (error) {
                this.logger.error({ error }, 'Error in watch interval:');
            }
        }, this.pollIntervalMs);

        this.logger.info(`Started watching for script changes every ${this.pollIntervalMs}ms`);
    }

    /**
     * Hook invoked after a script module is successfully created or updated
     */
    protected onScriptLoaded(_script: DynaScript, _moduleExports: any): void {}

    /**
     * Hook invoked after a script module is removed
     */
    protected afterRemoveModule(_keyCode: string, _modFile: string): void {}

    /**
     * Stop watching
     */
    stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
            this.logger.info('Stopped watching for script changes');
        }
    }

    getModule(key: string) {
        if (this.moduleInstances.has(key)) {
            return this.moduleInstances.get(key);
        }
        const filePath = this.flexiFiles.get(key);
        if (filePath && fs.existsSync(filePath)) {
            const modExports = this.evaluateModule(filePath);
            if (modExports) {
                this.moduleInstances.set(key, modExports);
            }
            return modExports;
        }
        return null;
    }
}