import * as fs from 'fs';
import log4js from "log4js";
import {DynaScript} from "./DynaModuleManager";
import path from "path";


export default abstract class BaseScriptLoader {

    protected logger = log4js.getLogger(this.constructor.name);
    private readonly scriptHome: string;
    private watchInterval: NodeJS.Timeout | null = null;
    private anchor: Date; // 从unix time(0)开始
    private readonly pollIntervalMs: number;
    private readonly timestampFile: string;
    private isLoading: boolean = false;
    private flexiFiles: Map<string, string>;

    /**
     * 构造函数
     * @param scriptHome 脚本存放的根路径
     * @param pollIntervalMs 更新间隔，单位毫秒
     * @protected
     */
    protected constructor(scriptHome: string, pollIntervalMs: number) {
        this.scriptHome = path.resolve(scriptHome);
        this.timestampFile = path.join(this.scriptHome, '.last_update_timestamp');
        this.logger.debug(`创建脚本管理器，插件路径:${this.scriptHome}`);
        this.pollIntervalMs = pollIntervalMs;
        this.flexiFiles = new Map<string, string>;
    }

    /**
     * 获取从指定锚点时间之后的更新脚本列表
     * @param anchor 锚点时间，获取此时间之后的脚本更新
     * @returns 返回脚本更新列表的 Promise
     */
    protected abstract getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>>;

    /**
     * 从指定的锚点时间开始加载最新的脚本更新
     * 处理每个脚本更新并保存新的时间戳
     * @returns Promise<void>
     */
    private async loadLatestScripts(loadAll: boolean = false): Promise<Array<DynaScript>> {
        if (this.isLoading) {
            this.logger.debug('Script loading already in progress, skipping...');
            return;
        }
        this.isLoading = true;
        try {
            const scriptList = await this.getUpdatedScripts(loadAll ? new Date(0) : this.anchor);
            if (scriptList.length > 0) {
                let ts = this.anchor;
                // 处理每个更新的脚本
                for (const item of scriptList) {
                    await this.processScriptUpdate(item, item.latestUpdated > this.anchor);
                    if (ts < item.latestUpdated) {
                        ts = item.latestUpdated;
                    }
                }
                if (ts != this.anchor) {
                    this.anchor = ts;
                    this.saveLastUpdateTimestamp();
                }
            }
        } catch (error) {
            this.logger.error('Error loading latest scripts:', error);
        } finally {
            this.isLoading = false;
        }
    }


    /**
     * 删除脚本文件并清理 require 缓存
     * @param filePath 要删除的文件路径
     * @returns Promise<void>
     */
    private async removeScriptFile(filePath: string): Promise<void> {
        if (await fs.promises.access(filePath).then(() => true).catch(() => false)) {
            await fs.promises.unlink(filePath);
            this.logger.info(`Script file deleted: ${filePath}`);
        } else {
            this.logger.info(`Script file not found: ${filePath}`);
        }
        if (require.cache[filePath]) {
            delete require.cache[filePath];
            this.logger.debug(`Require cache cleared for: ${filePath}`);
        }
    }

    async init(): Promise<void> {
        let clean = !fs.existsSync(this.timestampFile);
        this.ensurePluginsDirectory('plugins', clean);
        this.anchor = this.loadLastUpdateTimestamp();
        await this.loadLatestScripts(true);
        this.startWatching();
    }

    /**
     * 从时间戳文件加载上次更新的时间戳
     * 如果文件不存在或读取失败，返回 Unix epoch (1970-01-01)
     * @returns 上次更新的时间戳或默认时间戳
     */
    private loadLastUpdateTimestamp(): Date {
        try {
            if (fs.existsSync(this.timestampFile)) {
                const timestamp = fs.readFileSync(this.timestampFile, 'utf8').trim();
                const timestampNum = parseInt(timestamp);
                if (!isNaN(timestampNum) && timestampNum > 0) {
                    const date = new Date(timestampNum);
                    this.logger.debug(`加载上次更新时间戳: ${date.toISOString()}`);
                    return date;
                } else {
                    this.logger.warn(`无效的时间戳格式: ${timestamp}`);
                }
            }
        } catch (error) {
            this.logger.error('读取时间戳文件失败:', error);
        }
        this.logger.debug('使用默认时间戳: Unix epoch (1970-01-01)');
        return new Date(0);
    }

    /**
     * 将当前时间戳保存到时间戳文件
     */
    private saveLastUpdateTimestamp(): void {
        try {
            fs.writeFileSync(this.timestampFile, this.anchor.getTime().toString(), 'utf8');
            this.logger.debug(`保存时间戳: ${this.anchor.toISOString()}`);
        } catch (error) {
            this.logger.error('保存时间戳文件失败:', error);
        }
    }

    /**
     * 确保插件目录存在，如果不存在则创建
     * @param directory 目录名称
     * @param clean 是否清空目录，默认为 false
     */
    private ensurePluginsDirectory(directory: string, clean: boolean = false): void {
        let dir = path.resolve(this.scriptHome, directory);
        if (clean) {
            this.logger.info(`清空脚本插件路径${dir}`)
            fs.rmSync(`${dir}`, {force: true, recursive: true});
        }
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
            this.logger.info(`Created plugins directory: ${dir}`);
        }
    }


    /**
     * 处理单个脚本的更新
     * 根据脚本状态决定是加载/更新还是删除脚本
     * @returns Promise<void>
     * @param item
     * @param rewrite
     */
    private async processScriptUpdate(item: DynaScript, rewrite: boolean): Promise<void> {
        // 检查脚本状态和内容
        if (item.active) {
            // 活动状态且有脚本内容 - 加载或更新脚本
            await this.loadOrUpdateScript(item, rewrite);
        } else {
            // 删除状态或无脚本内容 - 移除脚本
            await this.removeScript(item);
        }
    }

    /**
     * 加载或更新脚本文件和实例
     * 将脚本内容写入文件，动态加载并缓存实例
     * @param item 脚本数据
     * @param rewrite
     * @returns Promise<void>
     */
    private async loadOrUpdateScript(item: DynaScript, rewrite: boolean): Promise<void> {
        const filePath = path.join(this.scriptHome, "plugins", `${item.fileName}.js`);
        try {
            if (rewrite) {
                // 缓存脚本实例
                const isNew = !fs.existsSync(filePath);
                // 写入脚本文件
                await this.writeScriptFile(filePath, item.scriptCode);
                this.logger.info(`Script file ${isNew ? 'created' : 'updated'}: ${filePath}`);
                // 清除require缓存以确保重新加载
                if (require.cache[filePath]) {
                    delete require.cache[filePath];
                }
            }
            this.flexiFiles.set(item.keyCode, filePath);
        } catch (error) {
            this.logger.error(`Failed to load/update script ${filePath}:`, error);
        }
    }


    /**
     * 移除脚本文件和缓存实例
     * @param item 脚本数据
     * @returns Promise<void>
     */
    private async removeScript(item: DynaScript): Promise<void> {
        const filePath = path.join(this.scriptHome, "plugins", `${item.fileName}.js`);
        await this.removeScriptFile(filePath);
        this.flexiFiles.delete(item.keyCode);
        if (require.cache[filePath]) {
            delete require.cache[filePath];
            this.logger.debug(`Require cache cleared for: ${filePath}`);
        }
    }

    /**
     * 将脚本内容写入到指定文件
     * @param filePath 文件路径
     * @param script 脚本内容
     * @returns Promise<void>
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
     * 启动脚本更新定时监控
     * 创建定时器定期检查和加载脚本更新
     */
    protected startWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
        }
        this.watchInterval = setInterval(async () => {
            try {
                await this.loadLatestScripts();
            } catch (error) {
                this.logger.error('Error in watch interval:', error);
            }
        }, this.pollIntervalMs);

        this.logger.log(`Started watching for script changes every ${this.pollIntervalMs}ms`);
    }

    /**
     * 停止脚本更新监控
     * 清理定时器并停止对脚本变化的监控
     */
    stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
            this.logger.log('Stopped watching for script changes');
        }
    }

    getModule(key: string) {
        let filePath = this.flexiFiles.get(key);
        if (filePath) {
            try {
                return require(filePath);
            } catch (ex) {
                this.logger.error(ex);
                return null;
            }
        } else {
            return null;
        }
    }
}