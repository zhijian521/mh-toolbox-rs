import { onScopeDispose, readonly, shallowRef } from 'vue';

/** 每种时钟独立对齐边界；首个订阅启动，最后一个作用域释放时清理。 */
export function createSharedClock<T extends string | number>(
    read: (now: number) => T,
    delay: (now: number) => number,
) {
    const value = shallowRef(read(Date.now()));
    const state = readonly(value);
    let users = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function refresh() {
        const now = Date.now();
        value.value = read(now);
        clearTimeout(timer);
        timer = setTimeout(refresh, delay(now));
    }

    function onVisible() {
        if (document.visibilityState === 'visible') refresh();
    }

    return function useClock() {
        if (users++ === 0) {
            refresh();
            window.addEventListener('focus', refresh);
            window.addEventListener('pageshow', refresh);
            document.addEventListener('visibilitychange', onVisible);
        }
        onScopeDispose(() => {
            if (--users !== 0) return;
            clearTimeout(timer);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('pageshow', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        });
        return state;
    };
}
