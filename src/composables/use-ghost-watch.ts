import { onScopeDispose, ref, shallowRef, watch } from 'vue';
import { listGhostWindows, probeGhostTask, type GhostWindow } from '../services/ghost';
import { loadGhostMaps, type GhostMap } from '../services/ghost-maps';
import {
    parseGhostTasks,
    type ParsedTask,
    type ParseReport,
    type TaskKind,
} from '../services/ghost-parse';
import { planFor, type EdgeRule, type GhostPlan } from '../services/ghost-model';

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

/**
 * 同分待定要连续多少帧才采纳。
 *
 * 只作用于「读到了另一套内容、完整度却一样」的情况——典型是把地名认成隔壁那张图。
 * 完整度**更高**的一帧立刻采纳，不等第二帧：游戏在动，清楚的那一帧可能只出现一次，
 * 等确认的代价就是把它丢掉，而那恰恰是最值钱的一帧。
 */
const STABLE_FRAMES = 2;

/** 连续失败几次才报错。偶发一次失败（窗口切到后台）不该让界面闪红。 */
const FAIL_TOLERANCE = 3;

/**
 * Rust 侧「指定句柄已经不在窗口列表里」的原文（`ghost.rs` 的 `ghost_probe`）。
 *
 * 只能按文本认：`invoke` 把 `Err(String)` 原样抛给 JS，没有错误码可判。
 * 两边任何一边改这句话，这里就静默退化成「一直报窗口已关闭」——所以改的时候
 * 要搜一次引用（`WINDOW_GONE`）。
 */
const WINDOW_GONE = '窗口已关闭';

/**
 * 结果的槽位。大小鬼是两条独立任务，各留各的最好一帧——
 * 小鬼那一行干净、大鬼那一行糊掉是常态，整帧一起丢等于把干净的那条也废了。
 */
const SLOTS: TaskKind[] = ['small', 'big'];

/** 保留下来的一条任务。 */
interface Held {
    task: ParsedTask;
    /** 完整度，见 `scoreTask`。新一帧不如它就一律不采纳。 */
    score: number;
    /** 最后一次「本帧读到的就是它」的时刻，用来算陈旧秒数。 */
    seenAt: number;
    /** 同分待定的内容指纹与累计帧数。 */
    pendingKey: string;
    pendingCount: number;
}

/**
 * 一条任务读得有多完整。0 = 连地名都没对上，2 = 只有地名没有坐标，3 = 坐标可用。
 *
 * 分档依据是**这条结果还能不能画**：画得出范围比只能铺一层底图有用，
 * 铺得出底图比只剩一个地名有用。用它只做比较，不做展示。
 *
 * `0,0` 在白名单外的场景记 0 分：那是坐标被读没了，不是「坐标为 0」。
 * 照常采纳会静默降级成「全层找」，界面看起来完全正常，画的却是没有信息的底色。
 */
function scoreTask(task: ParsedTask): number {
    if (!task.map) return 0;
    if (task.x === 0 && task.y === 0) return task.map.noCoord === true ? 2 : 0;
    return 3;
}

/** 一条任务的内容指纹。只含读到的原文，不含范围计算——改规则不算「识别结果变了」。 */
function taskKey(task: ParsedTask): string {
    // 不含 `index`：界面早已不显示「第几个」，而序号是最容易被漏读的一个数字。
    // 把它算进指纹，某一帧丢了序号就会变成「同分但内容不同」→ 白等两帧 → 无谓地
    // 换一次内容，状态文案也跟着在「识别中 / 监听中」之间跳一下。
    return [task.kind, task.mapText, task.x, task.y, task.reveal].join(':');
}

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
    const rule = ref<EdgeRule>('relative');

    /**
     * 每个槽位保留的那一份。这是整个模块的核心：
     *
     * 游戏画面一直在动，同一行文字这一帧读得干净、下一帧就糊掉。「糊掉」并不代表
     * 任务变了，只代表这一帧没读清。早先的写法是整帧替换，于是**一帧糊就把前面
     * 读到的好结果冲没了**，界面上表现为地图反复消失又出现。
     *
     * 现在按槽位保留：新的不如旧的就留着旧的，只有更好才换。旧结果持续不被刷新时
     * 通过 `ages` 如实告年龄，而不是假装它还是新的，也不是把它抹掉。
     */
    const held: Record<TaskKind, Held | null> = { small: null, big: null };

    let timer: number | null = null;
    let inFlight = false;
    let failCount = 0;
    let disposed = false;

    function recompute() {
        plans.value = SLOTS.map((kind) => held[kind])
            .filter((item): item is Held => item !== null)
            .map((item) => planFor(item.task, rule.value));
    }

    function resetHeld() {
        for (const kind of SLOTS) held[kind] = null;
        plans.value = [];
        settling.value = false;
        ages.value = { small: 0, big: 0 };
    }

    /**
     * 把这一帧读到的任务并进保留区。
     *
     * 三种情况分开处理，顺序不能换：
     * 1. 更好 → 直接换（好结果只有一帧也要抓住）
     * 2. 更差 → 不动（这就是「保留最佳」的全部内容）
     * 3. 一样好但内容不同 → 攒够帧数再换（挡掉把地名认成隔壁图的那种稳定误读）
     */
    function absorb(tasks: ParsedTask[], now: number) {
        const fresh = new Map<TaskKind, ParsedTask>();
        for (const task of tasks) {
            // 同一帧抓到两条同类型的（任务多时会出现）只取第一条：界面就两个位置，
            // 第三条既放不下也没法在图上区分。
            if (!fresh.has(task.kind)) fresh.set(task.kind, task);
        }

        for (const kind of SLOTS) {
            const incoming = fresh.get(kind);
            // 这一帧压根没读到这条：留着上一次的。任务栏滚动、折行变化都会造成这种缺行，
            // 把它当成「任务没了」会让图闪一下再回来。
            if (!incoming) continue;

            const current = held[kind];
            const key = taskKey(incoming);
            const score = scoreTask(incoming);

            if (!current) {
                held[kind] = {
                    task: incoming,
                    score,
                    seenAt: now,
                    pendingKey: '',
                    pendingCount: 0,
                };
                continue;
            }
            if (key === taskKey(current.task)) {
                current.seenAt = now;
                current.pendingKey = '';
                current.pendingCount = 0;
                continue;
            }
            if (score > current.score) {
                Object.assign(current, {
                    task: incoming,
                    score,
                    seenAt: now,
                    pendingKey: '',
                    pendingCount: 0,
                });
                continue;
            }
            if (score < current.score) continue;

            current.pendingCount = current.pendingKey === key ? current.pendingCount + 1 : 1;
            current.pendingKey = key;
            if (current.pendingCount >= STABLE_FRAMES) {
                Object.assign(current, {
                    task: incoming,
                    score,
                    seenAt: now,
                    pendingKey: '',
                    pendingCount: 0,
                });
            }
        }
    }

    /** 每条任务各自多久没被读到，逐槽位记，互不影响。 */
    function syncAge(now: number) {
        const next: Record<TaskKind, number> = { small: 0, big: 0 };
        for (const kind of SLOTS) {
            const item = held[kind];
            if (item) next[kind] = Math.round((now - item.seenAt) / 1000);
        }
        ages.value = next;
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

            const parsed = parseGhostTasks(result.lines, maps.value);
            // 原文每帧都换，不跟着「是否采纳」走：要排查的恰恰是糊掉的那些帧，
            // 只留干净的那一份等于把证据藏起来。
            report.value = parsed;

            absorb(parsed.tasks, now);
            recompute();
            syncAge(now);
            settling.value = SLOTS.some((kind) => (held[kind]?.pendingCount ?? 0) > 0);
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

    // 规则一改立刻重算，不等下一帧——用户点「绝对阈值」是为了马上看到差别。
    watch(rule, recompute);

    onScopeDispose(() => {
        disposed = true;
        stop();
    });

    return {
        running,
        starting,
        maps,
        windows,
        selectedHwnd,
        report,
        plans,
        error,
        stats,
        engine,
        settling,
        ages,
        rule,
        start,
        stop,
        toggle,
        prepare,
        refreshWindows,
    };
}
