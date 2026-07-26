import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { initialize, resetForTest } from '@ticatec/logger-wrapper';
import BaseScriptLoader from '../BaseScriptLoader';
import DynaModuleManager, { DynaScript } from '../DynaModuleManager';

class TestScriptLoader extends BaseScriptLoader {
    public mockScripts: Map<string, DynaScript> = new Map();

    constructor(scriptHome: string, pollIntervalMs: number = 100) {
        super(scriptHome, pollIntervalMs);
    }

    protected async getUpdatedScripts(anchor: Date): Promise<Array<DynaScript>> {
        const list: DynaScript[] = [];
        for (const item of this.mockScripts.values()) {
            if (item.latestUpdated > anchor) {
                list.push(item);
            }
        }
        return list;
    }

    public setMockScript(script: DynaScript) {
        this.mockScripts.set(script.keyCode, script);
    }
}

describe('scripts-loader', () => {
    const testDir = path.join(__dirname, 'temp_scripts');

    beforeAll(() => {
        resetForTest();
        initialize(pino({ level: 'silent' }));
    });

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        DynaModuleManager.resetInstance();
    });

    afterEach(() => {
        DynaModuleManager.resetInstance();
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('BaseScriptLoader', () => {
        test('should initialize plugins directory and timestamp file', async () => {
            const loader = new TestScriptLoader(testDir);
            loader.setMockScript({
                keyCode: 'initCheck',
                fileName: 'init_check',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'module.exports = {};'
            });
            await loader.init();

            const pluginsDir = path.join(testDir, 'plugins');
            const timestampFile = path.join(testDir, '.last_update_timestamp');

            expect(fs.existsSync(pluginsDir)).toBe(true);
            expect(fs.existsSync(timestampFile)).toBe(true);

            loader.stopWatching();
        });

        test('should load dynamic scripts into plugins directory and require module', async () => {
            const loader = new TestScriptLoader(testDir);
            const now = new Date();

            loader.setMockScript({
                keyCode: 'calcService',
                fileName: 'calc_service',
                active: true,
                latestUpdated: new Date(now.getTime() + 1000),
                scriptCode: 'module.exports = { add: (a, b) => a + b };'
            });

            await loader.init();

            const calcMod = loader.getModule('calcService');
            expect(calcMod).toBeDefined();
            expect(calcMod.add(2, 3)).toBe(5);

            loader.stopWatching();
        });

        test('should update dynamic script when scriptCode changes', async () => {
            const loader = new TestScriptLoader(testDir);
            const t1 = new Date(Date.now() + 1000);

            loader.setMockScript({
                keyCode: 'greetingService',
                fileName: 'greeting',
                active: true,
                latestUpdated: t1,
                scriptCode: 'module.exports = { greet: () => "Hello V1" };'
            });

            await loader.init();

            let mod = loader.getModule('greetingService');
            expect(mod.greet()).toBe('Hello V1');

            // Simulate update
            const t2 = new Date(t1.getTime() + 2000);
            loader.setMockScript({
                keyCode: 'greetingService',
                fileName: 'greeting',
                active: true,
                latestUpdated: t2,
                scriptCode: 'module.exports = { greet: () => "Hello V2" };'
            });

            // Trigger poll reload
            await (loader as any).loadLatestScripts();

            mod = loader.getModule('greetingService');
            expect(mod.greet()).toBe('Hello V2');

            loader.stopWatching();
        });

        test('should remove script file and cache when active is false', async () => {
            const loader = new TestScriptLoader(testDir);
            const t1 = new Date(Date.now() + 1000);

            loader.setMockScript({
                keyCode: 'tempService',
                fileName: 'temp',
                active: true,
                latestUpdated: t1,
                scriptCode: 'module.exports = { value: 42 };'
            });

            await loader.init();
            expect(loader.getModule('tempService')).toEqual({ value: 42 });

            // Deactivate
            const t2 = new Date(t1.getTime() + 2000);
            loader.setMockScript({
                keyCode: 'tempService',
                fileName: 'temp',
                active: false,
                latestUpdated: t2,
                scriptCode: ''
            });

            await (loader as any).loadLatestScripts();

            expect(loader.getModule('tempService')).toBeNull();
            const filePath = path.join(testDir, 'plugins', 'temp.js');
            expect(fs.existsSync(filePath)).toBe(false);

            loader.stopWatching();
        });

        test('should throw error on path traversal in fileName', async () => {
            const loader = new TestScriptLoader(testDir);
            loader.setMockScript({
                keyCode: 'evilScript',
                fileName: '../outside_plugin',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'module.exports = {};'
            });

            await loader.init();
            expect(loader.getModule('evilScript')).toBeNull();
            expect(fs.existsSync(path.join(testDir, 'outside_plugin.js'))).toBe(false);

            loader.stopWatching();
        });

        test('should halt anchor progression if a script evaluation fails', async () => {
            const loader = new TestScriptLoader(testDir);
            const t1 = new Date(Date.now() + 1000);
            const t2 = new Date(t1.getTime() + 2000);

            loader.setMockScript({
                keyCode: 'brokenScript',
                fileName: 'broken',
                active: true,
                latestUpdated: t1,
                scriptCode: 'syntax error invalid JS {{'
            });

            loader.setMockScript({
                keyCode: 'validScript',
                fileName: 'valid',
                active: true,
                latestUpdated: t2,
                scriptCode: 'module.exports = { ok: true };'
            });

            await loader.init();

            // Broken script failed, anchor should not jump past t1
            const anchor = (loader as any).anchor as Date;
            expect(anchor.getTime()).toBeLessThan(t1.getTime());
            expect(loader.getModule('brokenScript')).toBeNull();
            expect(loader.getModule('validScript')).toBeNull();

            loader.stopWatching();
        });

        test('should rewrite missing script file on init or full load even if timestamp file exists', async () => {
            const loader = new TestScriptLoader(testDir);
            const t1 = new Date(Date.now() + 1000);

            loader.setMockScript({
                keyCode: 'resilientScript',
                fileName: 'resilient',
                active: true,
                latestUpdated: t1,
                scriptCode: 'module.exports = { status: "recovered" };'
            });

            await loader.init();
            const filePath = path.join(testDir, 'plugins', 'resilient.js');
            expect(fs.existsSync(filePath)).toBe(true);
            loader.stopWatching();

            // Manually delete generated .js file while keeping timestamp file
            fs.unlinkSync(filePath);
            expect(fs.existsSync(filePath)).toBe(false);

            // Re-initialize loader with existing timestamp file
            const newLoader = new TestScriptLoader(testDir);
            newLoader.setMockScript({
                keyCode: 'resilientScript',
                fileName: 'resilient',
                active: true,
                latestUpdated: t1,
                scriptCode: 'module.exports = { status: "recovered" };'
            });

            await newLoader.init();
            expect(fs.existsSync(filePath)).toBe(true);
            expect(newLoader.getModule('resilientScript')).toEqual({ status: 'recovered' });

            newLoader.stopWatching();
        });

        test('should not advance anchor to same timestamp if one script at that timestamp fails', async () => {
            const loader = new TestScriptLoader(testDir);
            const sameTime = new Date(Date.now() + 1000);

            loader.setMockScript({
                keyCode: 'scriptA',
                fileName: 'script_a',
                active: true,
                latestUpdated: sameTime,
                scriptCode: 'module.exports = { name: "A" };'
            });

            loader.setMockScript({
                keyCode: 'scriptB',
                fileName: 'script_b',
                active: true,
                latestUpdated: sameTime,
                scriptCode: 'invalid syntax error {{{'
            });

            await loader.init();

            const anchor = (loader as any).anchor as Date;
            // Anchor should NOT advance to sameTime because scriptB failed at sameTime
            expect(anchor.getTime()).toBeLessThan(sameTime.getTime());

            loader.stopWatching();
        });

        test('should preserve existing working module if hot reload update fails', async () => {
            const loader = new TestScriptLoader(testDir);
            const t1 = new Date(Date.now() + 1000);

            // Version 1: Working
            loader.setMockScript({
                keyCode: 'hotReloadService',
                fileName: 'hot_reload',
                active: true,
                latestUpdated: t1,
                scriptCode: 'module.exports = { version: 1 };'
            });

            await loader.init();

            let mod = loader.getModule('hotReloadService');
            expect(mod.version).toBe(1);

            // Version 2: Broken update
            const t2 = new Date(t1.getTime() + 2000);
            loader.setMockScript({
                keyCode: 'hotReloadService',
                fileName: 'hot_reload',
                active: true,
                latestUpdated: t2,
                scriptCode: 'syntax error invalid code {{{'
            });

            // Trigger poll update
            await (loader as any).loadLatestScripts();

            // Existing version 1 should be preserved!
            mod = loader.getModule('hotReloadService');
            expect(mod).toBeDefined();
            expect(mod.version).toBe(1);

            const filePath = path.join(testDir, 'plugins', 'hot_reload.js');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            expect(fileContent).toContain('version: 1');

            loader.stopWatching();
        });

        test('should execute top-level script code exactly once per version update', async () => {
            const loader = new TestScriptLoader(testDir);
            (global as any).__execCount = 0;

            loader.setMockScript({
                keyCode: 'onceService',
                fileName: 'once_service',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'global.__execCount = (global.__execCount || 0) + 1; module.exports = { run: () => true };'
            });

            await loader.init();

            expect((global as any).__execCount).toBe(1);

            // Fetch via getModule
            const mod = loader.getModule('onceService');
            expect(mod).toBeDefined();
            // Execution count should still be 1 (NOT 2)
            expect((global as any).__execCount).toBe(1);

            delete (global as any).__execCount;
            loader.stopWatching();
        });

        test('should correctly resolve relative require and __filename inside scripts', async () => {
            const loader = new TestScriptLoader(testDir);

            // Write helper plugin file
            const pluginsDir = path.join(testDir, 'plugins');
            if (!fs.existsSync(pluginsDir)) {
                fs.mkdirSync(pluginsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(pluginsDir, 'helper.js'), 'module.exports = { value: "helper-ok" };');

            loader.setMockScript({
                keyCode: 'mainService',
                fileName: 'main_service',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: `
                    const helper = require('./helper');
                    module.exports = {
                        getHelperValue: () => helper.value,
                        getFilename: () => __filename
                    };
                `
            });

            await loader.init();

            const mainMod = loader.getModule('mainService');
            expect(mainMod).toBeDefined();
            expect(mainMod.getHelperValue()).toBe('helper-ok');
            expect(mainMod.getFilename()).toBe(path.join(pluginsDir, 'main_service.js'));

            loader.stopWatching();
        });

        test('should not advance memory anchor if saving timestamp file fails', async () => {
            const loader = new TestScriptLoader(testDir);
            const initialAnchor = (loader as any).anchor as Date;

            const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, ...args) => {
                if (typeof filePath === 'string' && filePath.includes('.last_update_timestamp')) {
                    throw new Error('Disk write error simulation');
                }
                return (fs as any).writeFileSync.wrappedMethod ? (fs as any).writeFileSync.wrappedMethod(filePath, ...args) : undefined;
            });

            loader.setMockScript({
                keyCode: 'failedSaveScript',
                fileName: 'failed_save',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'module.exports = {};'
            });

            await (loader as any).loadLatestScripts(false);

            const finalAnchor = (loader as any).anchor as Date;
            expect(finalAnchor.getTime()).toBe(initialAnchor.getTime());

            writeFileSyncSpy.mockRestore();
            loader.stopWatching();
        });
    });

    describe('DynaModuleManager', () => {
        test('should initialize singleton and access modules via manager', async () => {
            const manager = await DynaModuleManager.initialize(TestScriptLoader, testDir);
            expect(DynaModuleManager.getInstance()).toBe(manager);

            const loader = (manager as any).loader as TestScriptLoader;
            loader.setMockScript({
                keyCode: 'authBean',
                fileName: 'auth_bean',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'module.exports = { check: () => true };'
            });

            await (loader as any).loadLatestScripts();

            const bean = manager.get('authBean');
            expect(bean).toBeDefined();
            expect(bean.check()).toBe(true);

            manager.shutdown();
        });

        test('should handle concurrent initialize calls safely without duplicate loaders', async () => {
            const [m1, m2] = await Promise.all([
                DynaModuleManager.initialize(TestScriptLoader, testDir),
                DynaModuleManager.initialize(TestScriptLoader, testDir)
            ]);

            expect(m1).toBe(m2);
            expect(DynaModuleManager.getInstance()).toBe(m1);

            m1.shutdown();
        });

        test('should handle loader initialization failure gracefully without leaving unhandled rejection', async () => {
            class FailingLoader extends BaseScriptLoader {
                constructor(scriptHome: string, pollIntervalMs: number) {
                    super(scriptHome, pollIntervalMs);
                }
                async init(): Promise<void> {
                    throw new Error("Init database error");
                }
                protected async getUpdatedScripts(): Promise<Array<DynaScript>> {
                    return [];
                }
            }

            await expect(DynaModuleManager.initialize(FailingLoader, testDir, 100)).rejects.toThrow("Init database error");

            // Verify initPromise was cleared so new initialization can take place
            const manager = await DynaModuleManager.initialize(TestScriptLoader, testDir, 100);
            expect(manager).toBeDefined();
            manager.shutdown();
        });

        test('should abort in-flight initialization if resetInstance is called', async () => {
            class SlowLoader extends BaseScriptLoader {
                constructor(scriptHome: string, pollIntervalMs: number) {
                    super(scriptHome, pollIntervalMs);
                }
                async init(): Promise<void> {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
                protected async getUpdatedScripts(): Promise<Array<DynaScript>> {
                    return [];
                }
            }

            const initPromise = DynaModuleManager.initialize(SlowLoader, testDir, 100);
            DynaModuleManager.resetInstance();

            await expect(initPromise).rejects.toThrow("Initialization cancelled due to reset or shutdown.");
        });

        test('should allow manual refresh and trigger onScriptLoaded hook', async () => {
            let loadedCount = 0;
            class HookScriptLoader extends TestScriptLoader {
                protected onScriptLoaded(_script: DynaScript, _exports: any): void {
                    loadedCount++;
                }
            }

            const manager = await DynaModuleManager.initialize(HookScriptLoader, testDir, 100);
            const loader = (manager as any).loader as HookScriptLoader;

            loader.setMockScript({
                keyCode: 'manualScript',
                fileName: 'manual',
                active: true,
                latestUpdated: new Date(Date.now() + 1000),
                scriptCode: 'module.exports = { value: "manual" };'
            });

            const refreshed = await manager.refresh();
            expect(refreshed.length).toBe(1);
            expect(refreshed[0].keyCode).toBe('manualScript');
            expect(loadedCount).toBeGreaterThanOrEqual(1);

            manager.shutdown();
        });
    });
});
