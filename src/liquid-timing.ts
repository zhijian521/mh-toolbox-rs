type Phase = '路由模块' | '账本读取' | '首次挂载' | '账本内容挂载';

/** 开发工具中每页每阶段只保留最近一次测量。 */
export function startLiquidTiming(phase: Phase, page: string) {
    if (!import.meta.env.DEV) return;
    const label = '玻璃界面 · ' + phase + ' · ' + page;
    const start = performance.now();
    return () => {
        performance.clearMeasures(label);
        performance.measure(label, { start, end: performance.now() });
    };
}
