import * as fs from 'fs';
import * as path from 'path';
import log4js from "log4js";

export type ScriptInstance<T, K> = {
    metaData: K;
    instance: T;
}


export default abstract class BaseScriptLoader<T, K> {

    protected logger = log4js.getLogger(this.constructor.name);
    private scriptsCache: Map<string, ScriptInstance<T, K>> = new Map();
    private readonly scriptDir: string;
    private watchInterval: NodeJS.Timeout | null = null;
    private anchor: Date; // 从unix time(0)开始
    private readonly pollIntervalMs: number;
    private readonly timestampFile: string;
    private isLoading: boolean = false;

    protected constructor(scriptDir: string, pollIntervalMs: number, clean: boolean = false) {
        this.scriptDir = path.resolve(scriptDir);
        this.timestampFile = path.join(this.scriptDir, '.last_update_timestamp');
        this.logger.debug(`创建脚本管理器，插件路径:${this.scriptDir}`);
        this.pollIntervalMs = pollIntervalMs;
        this.ensurePluginsDirectory('plugins', clean);
        this.anchor = this.loadLastUpdateTimestamp(clean);
        this.startWatching();
    }

    /**
     * 从时间戳文件加载上次更新的时间戳
     * 如果文件不存在或读取失败，返回 Unix epoch (1970-01-01)
     * @returns 上次更新的时间戳或默认时间戳
     */
    private loadLastUpdateTimestamp(clean: boolean): Date {
        try {
            if (!clean && fs.existsSync(this.timestampFile)) {
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
     * @param timestamp 要保存的时间戳
     */
    private saveLastUpdateTimestamp(timestamp: Date): void {
        try {
            fs.writeFileSync(this.timestampFile, timestamp.getTime().toString(), 'utf8');
            this.logger.debug(`保存时间戳: ${timestamp.toISOString()}`);
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
        let dir = path.resolve(this.scriptDir, directory);
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
     * 获取从指定锚点时间之后的更新脚本列表
     * @param anchor 锚点时间，获取此时间之后的脚本更新
     * @returns 返回脚本更新列表的 Promise
     */
    protected abstract getUpdatedScripts(anchor: Date): Promise<Array<any>>;

    /**
     * 从指定的锚点时间开始加载最新的脚本更新
     * 处理每个脚本更新并保存新的时间戳
     * @returns Promise<void>
     */
    private async loadLatestScripts(): Promise<void> {
        if (this.isLoading) {
            this.logger.debug('Script loading already in progress, skipping...');
            return;
        }

        this.isLoading = true;
        try {
            const scriptList = await this.getUpdatedScripts(this.anchor);
            if (scriptList.length > 0) {
                // 处理每个更新的脚本
                for (const item of scriptList) {
                    await this.processScriptUpdate(item);
                }
                this.anchor = this.getNextAnchor(scriptList);
                this.saveLastUpdateTimestamp(this.anchor);
            }
        } catch (error) {
            this.logger.error('Error loading latest scripts:', error);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 获取下一个锚点时间
     * @param list 脚本列表
     * @returns 下一个锚点时间
     */
    protected abstract getNextAnchor(list: Array<any>): Date;

    /**
     * 判断脚本是否为活动状态
     * @param scriptData 脚本数据
     * @returns 如果脚本处于活动状态返回 true
     */
    protected abstract isActiveScript(scriptData: K): boolean;

    /**
     * 判断脚本是否已过时/需要删除
     * @param scriptData 脚本数据
     * @returns 如果脚本已过时需要删除返回 true
     */
    protected abstract isObsoletedScript(scriptData: K): boolean;

    /**
     * 获取脚本文件名
     * @param scriptData 脚本数据
     * @returns 脚本文件名（不包含扩展名）
     */
    protected abstract getFileName(scriptData: K): string;

    /**
     * 获取脚本的唯一标识键
     * @param scriptData 脚本数据
     * @returns 脚本的唯一标识键
     */
    protected abstract getScriptKey(scriptData: K): string;

    /**
     * 获取脚本内容文本
     * @param scriptData 脚本数据
     * @returns 脚本内容文本
     */
    protected abstract getScriptText(scriptData: K): string;


    /**
     * 处理单个脚本的更新
     * 根据脚本状态决定是加载/更新还是删除脚本
     * @param scriptData 脚本数据
     * @returns Promise<void>
     */
    private async processScriptUpdate(scriptData: K): Promise<void> {
        // 检查脚本状态和内容
        if (this.isActiveScript(scriptData)) {
            // 活动状态且有脚本内容 - 加载或更新脚本
            await this.loadOrUpdateScript(scriptData);
        } else if (this.isObsoletedScript(scriptData)) {
            // 删除状态或无脚本内容 - 移除脚本
            await this.removeScript(scriptData);
        }
    }

    /**
     * 加载或更新脚本文件和实例
     * 将脚本内容写入文件，动态加载并缓存实例
     * @param scriptData 脚本数据
     * @returns Promise<void>
     */
    private async loadOrUpdateScript(scriptData: K): Promise<void> {
        const fileName = this.getFileName(scriptData);
        const key = this.getScriptKey(scriptData);
        const filePath = path.join(this.scriptDir, 'plugins', `${fileName}.js`);
        try {
            // 缓存脚本实例
            const isNew = !this.scriptsCache.has(key);
            // 写入脚本文件
            await this.writeScriptFile(filePath, this.getScriptText(scriptData));
            this.logger.info(`Script file ${isNew ? 'created' : 'updated'}: ${filePath}`);
            // 清除require缓存以确保重新加载
            if (require.cache[filePath]) {
                delete require.cache[filePath];
            }
            // 动态加载脚本
            const moduleExports = require(filePath);
            const ScriptClass = moduleExports.default || moduleExports;
            if (typeof ScriptClass !== 'function') {
                throw new Error(`Script module does not export a constructor: ${filePath}`);
            }
            const instance: T = new ScriptClass();
            let apiInstance: ScriptInstance<T, K> = {metaData: scriptData, instance};
            this.scriptsCache.set(key, apiInstance);
        } catch (error) {
            this.logger.error(`Failed to load/update script ${filePath}:`, error);
        }
    }


    /**
     * 移除脚本文件和缓存实例
     * @param scriptData 脚本数据
     * @returns Promise<void>
     */
    private async removeScript(scriptData: K): Promise<void> {
        const fileName = this.getFileName(scriptData);
        const key = this.getScriptKey(scriptData);
        const filePath = path.join(this.scriptDir, 'plugins', `${fileName}.js`);
        await this.removeScriptFile(filePath);
        if (this.scriptsCache.has(key)) {
            this.scriptsCache.delete(key);
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
    public stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
            this.logger.log('Stopped watching for script changes');
        }
    }

    /**
     * 手动触发脚本更新检查
     * 立即执行一次脚本更新检查，不等待定时器
     * @returns Promise<void>
     */
    public async checkForUpdates(): Promise<void> {
        this.logger.log('Manually checking for script updates...');
        await this.loadLatestScripts();
    }

    /**
     * 根据键获取脚本实例
     * @param key 脚本的唯一标识键
     * @returns 脚本实例，如果不存在返回 null
     */
    public get(key: string): T | null {
        const scriptInst = this.scriptsCache.get(key);
        return scriptInst ? scriptInst.instance : null;
    }

}