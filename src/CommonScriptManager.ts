export default class CommonScriptManager {

    private static instance: CommonScriptManager = new CommonScriptManager();
    private map: Map<string, any>;

    private constructor() {
        this.map = new Map<string, any>();
    }

    static getInstance() {
        return CommonScriptManager.instance;
    }

    remove(code: string) {
        this.map.delete(code);
    }

    put<T>(code: string, serviceBean: T) {
        this.map.set(code, serviceBean);
    }

    get<T>(code: string): T {
        return this.map.get(code) as T;
    }
}