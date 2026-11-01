import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { hasDesktop } from '../services/desktop';
import { listGhostWindows, probeGhostTask, type GhostWindow } from '../services/ghost';
import { loadGhostMaps, type GhostMap } from '../services/ghost-maps';
import { parseGhostTasks, type ParseReport, type TaskKind } from '../services/ghost-parse';
import {
    absorbFrame,
    CONFIRM_FRAMES,
    createHold,
    heldTasks,
    holdAges,
    isSettling,
    SLOTS,
} from '../services/ghost-hold';
import { planFor, type GhostPlan } from '../services/ghost-model';

/**
 * 自动识别的状态机。
 *
 * 拆成 composable 而不是写在页面里，是因为这里有**三块独立的时序**缠在一起：
 * 轮询节奏、结果保留、失败重试。混在页面里，模板里任何一个 ref 都可能被这三条
 * 时序交替改写，出了问题只能靠猜。
 *
 * 不做成模块级单例：捉鬼只是工具列表里的一件，离开这一页就该停表。
 * 停止靠 `onScopeDispose`，不是靠页面在 `onBeforeUnmount` 里记得调——
 * 「记得调」的约定，第一次改布局就会漏。
 */

/** 轮询间隔。一次截屏 + OCR 实测在 200ms 上下，1.1s 留足余量，人感觉不到延迟。 */
const POLL_MS = 1100;

/** 连续失败几次才报错。偶发一次失败（窗口切到后台）不该让界面闪红。 */
const FAIL_TOLERANCE = 3;

/**
 * 「高概率区域」开关的存储键。
 *
 * 只持久化这一项，因为它是**显示偏好**：用户关掉多半是因为那块深红挡住了地形，
 * 下次进页面又要关一次就是白做。不要把 `running` 之类的也存进来——「进页面自动
 * 开始」是这一页的既定行为，存了状态就会变成「上次是停的，这次进来还是停的」。
 */
const HOT_KEY = 'mh-ghost-hot';

function readHot(): boolean {
    try {
        return window.localStorage.getItem(HOT_KEY) !== '0';
    } catch {
        // 存储被禁时 `getItem` 会抛。默认开——关着的话这个功能第一次进来根本看不见。
        return true;
    }
}

/**
 * Rust 侧「指定句柄已经不在窗口列表里」的原文（`ghost.rs` 的 `ghost_probe`）。
 *
 * 只能按文本认：`invoke` 把 `Err(String)` 原样抛给 JS，没有错误码可判。
 * 两边任何一边改这句话，这里就静默退化成「一直报窗口已关闭」——所以改的时候
 * 要搜一次引用（`WINDOW_GONE`）。
 */
const WINDOW_GONE = '窗口已关闭';

export function useGhostWatch() {
    const running = ref(false);
    const starting = ref(false);
    const maps = shallowRef<GhostMap[]>([]);
    const windows = shallowRef<GhostWindow[]>([]);
    const selectedHwnd = ref<number | null>(null);
    const report = shallowRef<ParseReport | null>(null);
    const plans = shallowRef<GhostPlan[]>([]);
    const error = ref('');
    const stats = ref<{ grabMs: number; ocrMs: number } | null>(null);
    /**
     * 本帧是哪个引擎认的。
     *
     * 「识别得很差」这句话，在两个引擎下是完全不同的两件事：PaddleOCR 差多半是
     * 模型没加载（退回了系统 OCR），系统 OCR 差是它本来就读不了彩色字。
     * 界面上把引擎名摆出来，省得每次都要先猜是哪一个在跑。
     */
    const engine = ref('');
    /**
     * 目标窗口所在显示器的有效 DPI（96 = 100%，144 = 150%）。
     *
     * ROI 的那组像素是按 125% 量的，Rust 侧每帧按这个数换算。摆到界面上是因为
     * 「改了系统缩放就识别变差」是真实发生过的问题：先看这个数对不对，
     * 显示 150% 而系统也确实 150%，才轮到怀疑 ROI 本身。
     */
    const dpi = ref(96);
    /** 有同分待定还没确认。界面据此显示「识别中」。 */
    const settling = ref(false);
    /**
     * 每条任务各自多久没被读到（秒）。0 = 本帧刚读到。
     *
     * 必须**分槽位**：两条任务的读清概率互相独立，大鬼那行常糊、小鬼每帧都干净是常态。
     * 取两者的最大值来标年龄，会让一直在读的那条也跟着显示「40s 前」——
     * 用户据此判断「这条任务是不是没了」，标错就是误导。
     */
    const ages = ref<Record<TaskKind, number>>({ small: 0, big: 0 });
    /**
     * 是否画「高概率区域」（社区经验：假坐标 ≤50 往小、≥150 往大）。
     *
     * 做成开关而不是固定画：那块深红会压掉一半地形，而地形本身就是缩小范围的
     * 依据（洞口、通道、水陆分界）。有人靠它，有人嫌它挡图，两种都合理。
     */
    const hot = ref(readHot());

    /**
     * 有没有 Tauri 宿主。浏览器预览里页面照样能渲染，但没有截屏能力，
     * 这不是「出错了」，得单独说一句，否则用户会一直等一个永远不来的结果。
     */
    const desktop = hasDesktop();

    /**
     * 状态行那句话。
     *
     * 它属于业务而不是版式：「这一帧到底在等什么」只有这里知道（连不稳要等两帧、
     * 失败要连续三次才报）。早先写在页面里，页面于是间接持有了 `CONFIRM_FRAMES`
     * 这个时序常量——页面不该知道时序。
     */
    const statusText = computed(() => {
        if (!desktop) return '浏览器预览里读不到屏幕';
        if (error.value) return error.value;
        if (starting.value) return '正在启动';
        if (!running.value) return '未开始';
        // 「识别中」不是「还没读到」：画面上的结果是留住的那一份，只是这一帧读到了
        // 另一套内容、还没连稳到足够可信。这句话必须说清楚在等什么，否则用户看到
        // 地图不动、灯在跳，只会以为卡住了。
        if (settling.value) return `另一套读法等 ${CONFIRM_FRAMES} 帧确认`;
        return '监听中';
    });

    /** 状态灯的三种颜色。是否出错由这里判，页面只负责按名字上色。 */
    const statusKind = computed<'idle' | 'live' | 'warn'>(() => {
        if (error.value) return 'warn';
        return running.value ? 'live' : 'idle';
    });

    /**
     * 引擎名。两个名字刻意写得不一样长：`PP-OCRv4` 是正常态，看到「系统 OCR」
     * 就说明模型没加载、退回了 Windows 自带引擎——那时候识别差是预期的，不是新 bug。
     */
    const engineLabel = computed(() => {
        if (!engine.value) return '';
        return engine.value === 'paddle' ? 'PP-OCRv4' : '系统 OCR';
    });

    /**
     * 是否退回了系统 OCR。
     *
     * 这条必须**自己说出来**。`ghost.rs` 在模型加载失败时会静默退回 `Windows.Media.Ocr`：
     * 截屏照截、正则照跑、状态灯照样是绿的，只有彩色字全认不出。用户看到的会是
     * 「识别水平就这样」，而不是「有个东西坏了」——2026-11-01 就是这样白等了一整天，
     * 当时真因只是打包漏了一个字典文件。
     *
     * 所以降级不许安静：引擎名挂在「识别原文」标题上还不够（那是折叠区，不点开看不见），
     * 页面要在状态区直接摊开。
     */
    const degraded = computed(() => engine.value === 'windows');

    /**
     * 系统缩放比。ROI 的标定值是在 125% 下量的，Rust 每帧按这个数换算成物理像素。
     *
     * 摆在状态行里是因为「改了系统缩放识别就变差」是真实踩过的坑：先确认这个数
     * 和系统设置一致，再怀疑别的。不一致就说明窗口不在你以为的那块屏上。
     */
    const scalePercent = computed(() => Math.round((dpi.value / 96) * 100));

    /**
     * 每个槽位保留的那一份。规则全在 `services/ghost-hold` 里——那一层是纯函数，
     * 能直接喂一串帧测出「会不会闪」，而时序的错法截一张图是看不出来的。
     *
     * 这里只负责持有：新的一帧进来就并一次，界面永远画「保留区」而不是「这一帧」。
     */
    const hold = createHold();

    let timer: number | null = null;
    let inFlight = false;
    let failCount = 0;
    let disposed = false;

    function recompute() {
        plans.value = heldTasks(hold).map((task) => planFor(task, hot.value));
    }

    function resetHeld() {
        for (const kind of SLOTS) hold[kind] = null;
        plans.value = [];
        settling.value = false;
        ages.value = { small: 0, big: 0 };
    }

    async function refreshWindows() {
        windows.value = await listGhostWindows();
        // 用户没手动选过时，若恰好只剩一个候选就替它选上，省一次操作。
        if (selectedHwnd.value === null && windows.value.length === 1) {
            selectedHwnd.value = windows.value[0].hwnd;
        }
    }

    async function tick() {
        if (inFlight || disposed || !running.value) return;
        inFlight = true;
        try {
            const result = await probeGhostTask(selectedHwnd.value);
            failCount = 0;
            error.value = '';
            const now = Date.now();
            stats.value = { grabMs: result.grabMs, ocrMs: result.ocrMs };
            engine.value = result.engine;
            dpi.value = result.dpi;

            const parsed = parseGhostTasks(result.lines, maps.value);
            // 原文每帧都换，不跟着「是否采纳」走：要排查的恰恰是糊掉的那些帧，
            // 只留干净的那一份等于把证据藏起来。
            report.value = parsed;

            absorbFrame(hold, parsed.tasks, now);
            recompute();
            ages.value = holdAges(hold, now);
            settling.value = isSettling(hold);
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            // 游戏重开后句柄就作废了。若继续拿着旧 hwnd，之后每一帧都会得到同一个
            // 「窗口已关闭」，而重试的是同一次调用、同一份选择——不会自愈，只能让用户
            // 手动去下拉里重选。所以这一条不计数：清掉选择、重新枚举，下一帧按标题重新挑。
            if (message.includes(WINDOW_GONE)) {
                selectedHwnd.value = null;
                failCount = 0;
                await refreshWindows();
                error.value = '游戏窗口已重开，正在重新查找';
                return;
            }
            failCount += 1;
            if (failCount >= FAIL_TOLERANCE) error.value = message;
        } finally {
            inFlight = false;
        }
    }

    async function start() {
        if (running.value || starting.value) return;
        starting.value = true;
        try {
            if (maps.value.length === 0) maps.value = await loadGhostMaps();
            if (windows.value.length === 0) await refreshWindows();
            running.value = true;
            resetHeld();
            failCount = 0;
            error.value = '';
            await tick();
            timer = window.setInterval(() => void tick(), POLL_MS);
        } finally {
            starting.value = false;
        }
    }

    function stop() {
        running.value = false;
        settling.value = false;
        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
    }

    function toggle() {
        if (running.value) stop();
        else void start();
    }

    /** 页面打开就先加载地图与窗口列表：用户还没点开始，就该能选要监听哪个窗口。 */
    async function prepare() {
        if (maps.value.length === 0) maps.value = await loadGhostMaps();
        await refreshWindows();
    }

    // 开关一改立刻重算，不等下一帧——开它就是为了马上看到那块深红。
    watch(hot, (value) => {
        try {
            window.localStorage.setItem(HOT_KEY, value ? '1' : '0');
        } catch {
            // 存不上只影响下次进页面的默认值，本次显示照常。
        }
        recompute();
    });

    onScopeDispose(() => {
        disposed = true;
        stop();
    });

    // 只导出页面真的会用到的。`maps` / `stop` / `refreshWindows` 在内部被
    // `start` / `toggle` / 句柄自愈用着，但页面一次都没解构过——摆在这里等于
    // 多三个「看起来可以调」的入口，谁哪天拿去用就会在不该停的时候停表。
    return {
        running,
        starting,
        windows,
        selectedHwnd,
        report,
        plans,
        error,
        stats,
        engine,
        dpi,
        settling,
        ages,
        hot,
        desktop,
        statusText,
        statusKind,
        engineLabel,
        degraded,
        scalePercent,
        start,
        toggle,
        prepare,
    };
}
