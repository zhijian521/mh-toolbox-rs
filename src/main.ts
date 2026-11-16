import { createApp, h, nextTick, ref } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/blocks.css';
import App from './App.vue';
import { useFontScale } from './composables/use-font-scale';
import { useFontFamily } from './composables/use-font-family';
import { useTheme } from './composables/use-theme';
import { askConfirm } from './composables/use-confirm';
import { confirmDiscardDrafts } from './composables/use-draft-guard';
import { guardWindowClose, notifyAppReady } from './services/desktop';
import { flushPendingWrites } from './services/persist';
import { router } from './router';
import type { StartupNotice } from './services/legacy-startup';

/** 偏好在挂载前落地，冷启动任意页面都恢复字体、字号与主题。 */
useFontFamily();
useFontScale();
useTheme();

const loading = ref(true);
const startupError = ref('');
const startupStage = ref(0);
let startupNotice: StartupNotice | undefined;
let releaseRoutes = () => {};
const dataReady = new Promise<void>((resolve) => {
    releaseRoutes = resolve;
});
// 拦在路由组件导入之前，避免模块求值或页面监听读到尚未装配的游戏规则和空账本。
const removeLoadingGuard = router.beforeEach(() => dataReady);
router.beforeEach((to, from) => (to.path === from.path ? true : confirmDiscardDrafts()));

createApp({
    render: () =>
        h(App, {
            loading: loading.value,
            startupError: startupError.value,
            startupStage: startupStage.value,
        }),
})
    .use(router)
    .mount('#app');

/** 把后续工作放到绘制机会之后；隐藏窗口不依赖暂停的动画帧。 */
function afterPaint(): Promise<void> {
    return new Promise((resolve) => {
        if (document.hidden) {
            setTimeout(resolve, 0);
            return;
        }
        const frame = requestAnimationFrame(() => {
            clearTimeout(timer);
            setTimeout(resolve, 0);
        });
        // 排帧后最小化窗口也不能让启动或关窗一直等待。
        const timer = setTimeout(() => {
            cancelAnimationFrame(frame);
            resolve();
        }, 100);
    });
}

const startup = afterPaint().then(async () => {
    try {
        const data = await import('./startup');
        startupStage.value = 1;
        startupNotice = await data.initializeData();
        return data;
    } catch (error) {
        console.error('应用启动失败', error);
        startupError.value = '启动失败，请重新加载';
        return null;
    }
});

void startup.then(async (data) => {
    if (!data) return;
    try {
        startupStage.value = 2;
        releaseRoutes();
        await router.isReady();
        removeLoadingGuard();
        loading.value = false;
        await nextTick();
        await afterPaint();
        void notifyAppReady();
        if (startupNotice) {
            void askConfirm({ ...startupNotice, confirmText: '知道了', cancelText: '' });
        }
    } catch (error) {
        console.error('页面加载失败', error);
        startupError.value = '页面加载失败，请重新加载';
    }
});

void guardWindowClose(async () => {
    if (!(await confirmDiscardDrafts())) return false;
    const data = await startup;
    const synced = data ? await data.flushDailySync() : true;
    const written = await flushPendingWrites();
    if (synced && written) return true;
    return askConfirm({
        danger: true,
        title: '仍有改动未保存，退出吗？',
        note: '退出会丢失未保存的改动。取消后可在页面重试保存，或检查磁盘空间。',
        confirmText: '退出',
    });
});
