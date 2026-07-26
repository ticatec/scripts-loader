import { getLogger, Logger } from "@ticatec/logger-wrapper";
import BaseScriptLoader from "./BaseScriptLoader.js";

export interface DynaScript {
    /**
     * Key code identifier
     */
    keyCode: string;
    /**
     * Target file name
     */
    fileName: string;
    /**
     * Active state flag
     */
    active: boolean;
    /**
     * Last update timestamp
     */
    latestUpdated: Date;
    /**
     * Executable script source code
     */
    scriptCode: string;
}

export default class DynaModuleManager {

    private static instance: DynaModuleManager;
    private static initPromise: Promise<DynaModuleManager> | null = null;
    private static initSeq = 0;

    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }
    private loader: BaseScriptLoader;

    private constructor(loader: BaseScriptLoader) {
        this.loader = loader;
    }

    static getInstance(): DynaModuleManager {
        if (DynaModuleManager.instance == null) {
            throw new Error("Instance hasn't been initialized.");
        }
        return DynaModuleManager.instance;
    }

    /**
     * Safely initialize singleton instance in thread-safe / concurrent async manner
     */
    static async initialize<Args extends any[]>(loaderConstructor: new (...args: Args) => BaseScriptLoader, ...args: Args): Promise<DynaModuleManager> {
        if (DynaModuleManager.instance != null) {
            return DynaModuleManager.instance;
        }
        if (DynaModuleManager.initPromise == null) {
            const currentSeq = ++DynaModuleManager.initSeq;
            const initialization = (async () => {
                const loader = new loaderConstructor(...args);
                await loader.init();
                if (currentSeq !== DynaModuleManager.initSeq) {
                    loader.stopWatching();
                    throw new Error("Initialization cancelled due to reset or shutdown.");
                }
                DynaModuleManager.instance = new DynaModuleManager(loader);
                return DynaModuleManager.instance;
            })();

            const guarded = initialization.finally(() => {
                if (DynaModuleManager.initPromise === guarded) {
                    DynaModuleManager.initPromise = null;
                }
            });

            DynaModuleManager.initPromise = guarded;
        }
        return DynaModuleManager.initPromise;
    }

    /**
     * Reset singleton instance (primarily used in unit tests)
     */
    static resetInstance(): void {
        DynaModuleManager.initSeq++;
        DynaModuleManager.initPromise = null;
        if (DynaModuleManager.instance && DynaModuleManager.instance.loader) {
            DynaModuleManager.instance.loader.stopWatching();
        }
        DynaModuleManager.instance = undefined as any;
    }

    /**
     * Programmatically trigger an immediate reload of scripts
     * @param forceAll If true, re-fetches all scripts regardless of timestamp
     */
    async refresh(forceAll: boolean = false): Promise<Array<DynaScript>> {
        return await this.loader.refresh(forceAll);
    }

    /**
     * Retrieves loaded script module by key
     * @param key Unique key code for the script module
     * @returns Module exports or null if not found
     */
    get(key: string): any {
        return this.loader.getModule(key);
    }

    /**
     * Shutdown dynamic module manager and stop file watchers
     */
    shutdown() {
        DynaModuleManager.initSeq++;
        DynaModuleManager.initPromise = null;
        if (DynaModuleManager.instance && DynaModuleManager.instance.loader) {
            DynaModuleManager.instance.loader.stopWatching();
        }
        DynaModuleManager.instance = undefined as any;
    }
}