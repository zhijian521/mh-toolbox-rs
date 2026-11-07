import { onScopeDispose, readonly, ref } from 'vue';
import { todayText } from '../services/format';

const today = ref(todayText());
let users = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** 本地午夜更新；休眠、后台节流或改过系统时间后，在恢复窗口时重新对时。 */
function refresh() {
    today.value = todayText();
    clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 20);
}

function onVisible() {
    if (document.visibilityState === 'visible') refresh();
}

/** 所有消费者共享一个计时器，最后一个作用域销毁时移除监听。 */
export function useToday() {
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
    return readonly(today);
}
