import log4js from "log4js";
import BaseScriptLoader from "./BaseScriptLoader";

export interface DynaScript {
    /**
     *
     */
    keyCode: string;
    /**
     *
     */
    fileName: string;
    /**
     *
     */
    active: boolean;
    /**
     * 最后更新时间
     */
    latestUpdated: Date;
    /**
     *
     */
    scriptCode: string;
}


export default class DynaModuleManager {

    private static instance: DynaModuleManager;

    protected logger = log4js.getLogger(this.constructor.name);
    private loader: BaseScriptLoader;

    private constructor(loader: BaseScriptLoader) {
        this.loader = loader;
    }

    static getInstance(): DynaModuleManager {
        if (DynaModuleManager.instance == null) {
            throw new Error("Instance hasn't been initialized.")
        }
        return DynaModuleManager.instance;
    }

    static async initialize<Args extends any[]>(loaderConstructor: new (...args: Args) => BaseScriptLoader, ...args: Args): Promise<DynaModuleManager> {
        if (DynaModuleManager.instance == null) {
            const loader = new loaderConstructor(...args);
            await loader.init();
            DynaModuleManager.instance = new DynaModuleManager(loader);
        }
        return DynaModuleManager.instance;
    }

    /**
     * 根据键获取脚本实例
     * @param key 脚本的唯一标识键
     * @returns 脚本实例，如果不存在返回 null
     */
    get(key: string): any {
        return this.loader.getModule(key);
    }

    /**
     * 关闭动态模块管理，通常用于系统推出的时候
     */
    shutdown() {
        DynaModuleManager.instance.loader.stopWatching();
    }
}