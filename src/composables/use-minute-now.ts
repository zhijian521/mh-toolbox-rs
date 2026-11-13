import { onScopeDispose, readonly, ref } from 'vue';

const now = ref(Date.now());
let users = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function refresh() {
    now.value = Date.now();
    clearTimeout(timer);
    timer = setTimeout(refresh, 60_000 - (now.value % 60_000) + 20);
}

function onVisible() {
    if (document.visibilityState === 'visible') refresh();
}

/** 只刷新读数；共享分钟时钟不触发业务数据写入。 */
export function useMinuteNow() {
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
    return readonly(now);
}
