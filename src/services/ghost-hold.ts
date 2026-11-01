import type { ParsedTask, TaskKind } from './ghost-parse';

/**
 * 识别结果的「保留最佳」。
 *
 * 游戏画面一直在动：同一行任务文字这一帧读得干净、下一帧被人挡住或糊掉。
 * 「这一帧没读清」不代表任务变了，所以**不能整帧替换**——那样一帧糊就把前面
 * 读到的好结果冲没了，界面上表现为地图反复消失又出现。
 *
 * 这里按**大小鬼两个槽位各留一份**：两条任务的读清概率互相独立，大鬼那行常糊、
 * 小鬼每帧都干净是常态，整帧一起判等于把干净的那条也废了。
 *
 * 抽成纯函数而不是写在 composable 里，是为了能直接用「连续帧序列」测试它——
 * 这一层的错法全是时序的，截一张图看不出来，只有喂一串帧才现形。
 * 不碰 Vue、不碰 Tauri。
 */

/** 两个槽位。顺序决定界面上的上下顺序，也决定遍历顺序。 */
export const SLOTS: TaskKind[] = ['small', 'big'];

/**
 * 同分不同内容，要连续多少帧一致才采纳。
 *
 * 3 帧 ≈ 3.3 秒（`POLL_MS` 1100）。订这个数是为了**过滤遮挡**：
 * NPC 走过去、光效盖住一行字，通常一两秒就过去，凑不满三帧。
 *
 * 更完整的一帧（分数更高）和「换了一张图」不受这条约束，立刻采纳——
 * 前者的机会可能只有一帧，后者必然是换了任务。见 `absorbFrame`。
 */
export const CONFIRM_FRAMES = 3;

/** 保留下来的一条任务。 */
export interface Held {
    task: ParsedTask;
    /** 完整度，见 `scoreTask`。新一帧不如它就一律不采纳。 */
    score: number;
    /** 最后一次「本帧读到的就是它」的时刻，用来算陈旧秒数。 */
    seenAt: number;
    /** 同分待定中的内容指纹与累计帧数。 */
    pendingKey: string;
    pendingCount: number;
}

export type HoldState = Record<TaskKind, Held | null>;

export function createHold(): HoldState {
    return { small: null, big: null };
}

/**
 * 一条任务读得有多完整，按**三段独立信息**加权。
 *
 * 分档依据是「这段信息还缺不缺」，而不是「读得准不准」——后者没有外部参照，
 * 判不了。三段，权重按「缺了谁更致命」定：
 *
 * - 1 地名对上底图：没有它连图都铺不出来；
 * - 句尾（`附近` / `处` / 空）：有它才知道画范围还是画精确点，档位见 `tailScore`；
 * - 4 坐标：有它才画得出框。
 *
 * 坐标给到最大权重不是随手排的：**丢了坐标的一帧绝不能顶掉句尾没读全的一帧**。
 * 若按「1/2/4 对应地图/坐标/句尾」排，`去江南野外0,0附近` 会拿到 5 分、
 * 盖过上一帧 `去江南野外134,54`（3 分），画面当场从真坐标跳成「识别失败」。
 *
 * 缺一段就一定比齐了的那一帧差，所以低分帧永远顶不掉高分帧——这就是「保留最佳」
 * 的全部内容。
 *
 * `0,0` 在白名单外的场景拿不到坐标那 4 分：那是坐标被读没了，不是「坐标为 0」。
 */
/**
 * 句尾拿几分。三档，不是两档。
 *
 * - **2**：读到 `附近` 或 `处`，画范围还是画点有字为凭；
 * - **1**：`silent`——坐标读到了，句尾一个字都没有。这**大概率是真开了天眼**
 *   （游戏把 `附近` 删了），但「少了两个字」也可能只是 OCR 漏读，所以比有字低一档；
 * - **0**：`unknown`，走的是兜底句式，结构都没了。
 *
 * `silent` 定 1 而不是 2，是为了让**误判能自己退回去**：某一帧漏读了「附近」被判成
 * 精确点，下一帧读回 `附近` 就是更高分，按规则 2 立刻换回范围，用户最多看到一次闪。
 * 若定 2，两者同分，「漏读 → 正确」要等三帧确认，三秒多里用户照着一个点去找。
 *
 * 代价是「`nearby` → `silent`」成了降分，按分数永远走不动——那一步由 `revealStep`
 * 单独放行，见下。
 */
function tailScore(reveal: ParsedTask['reveal']): number {
    if (reveal === 'nearby' || reveal === 'exact') return 2;
    if (reveal === 'silent') return 1;
    return 0;
}

export function scoreTask(task: ParsedTask): number {
    if (!task.map) return 0;
    const hasCoords = task.x !== 0 || task.y !== 0 || task.map.noCoord === true;
    return 1 + tailScore(task.reveal) + (hasCoords ? 4 : 0);
}

/**
 * 一条任务的内容指纹。
 *
 * 地名用**底图 id**，不用 OCR 原文：`碗孑山` / `腕孑山` 是同一张图，
 * 拿原文当指纹会让这两种写法互相判成「内容变了」，白白进待定队列。
 * 而待定的表现是 `settling` 忽真忽假、状态文案在「识别中 / 监听中」之间跳。
 *
 * 不含 `index`：界面早已不显示「第几个」，而序号是最容易被漏读的一个数字。
 */
function taskKey(task: ParsedTask): string {
    return [task.kind, task.map?.id ?? `?${task.mapText}`, task.x, task.y, task.reveal].join(':');
}

/**
 * 换了一张图 = 换了任务。
 *
 * 一条任务在一次搜索里的地图是固定的，所以图变了不可能是「同一件事读糊了」。
 * 放开这一条，是为了让「交了旧的、接了新的」这件事**立刻**反映到界面上——
 * 否则新任务的坐标也要等三帧确认，那三秒里用户会照着旧地图跑。
 */
function switchedMap(current: ParsedTask, incoming: ParsedTask): boolean {
    return Boolean(current.map && incoming.map && current.map.id !== incoming.map.id);
}

/**
 * 「附近」消失后要连续几帧才认。见 `revealStep`。
 *
 * 2 帧 ≈ 2.2 秒（`POLL_MS` 1100）。NPC 走过去把一行字糊掉通常一两秒就过去，
 * 凑不满两帧；而真开眼之后「附近」是**永久**不再出现，两帧之后必然满足。
 */
export const REVEAL_SILENT_FRAMES = 2;

/**
 * 天眼推进：同一张图、同一个坐标，句尾从 `附近` 变成了别的。
 *
 * 返回值是要凑的帧数，0 表示不适用。两种推进的强度**不一样**：
 *
 * - `nearby → exact`（读到 `处`）：信息只增不减，一帧即采纳；
 * - `nearby → silent`（`附近` 两个字没了）：这是**缺失**，而缺失比存在弱——
 *   OCR 漏读两个字比凭空多读两个字常见得多，所以要求连续两帧。
 *
 * 反向（`exact` / `silent` → `nearby`）不走这里，交给分数：`nearby` 是 2 分、
 * `silent` 是 1 分，更高分按规则 2 立刻采纳。这就是 `tailScore` 里把 `silent`
 * 定成 1 的用处——误判能在下一帧自己退回去，不用等三帧。
 */
function revealStep(current: ParsedTask, incoming: ParsedTask): number {
    if (current.reveal !== 'nearby') return 0;
    if (current.x !== incoming.x || current.y !== incoming.y) return 0;
    if (switchedMap(current, incoming)) return 0;
    if (incoming.reveal === 'exact') return 1;
    if (incoming.reveal === 'silent') return REVEAL_SILENT_FRAMES;
    return 0;
}

/**
 * 序号读得到、又没变，坐标却变了——**这一条一定是误读**。
 *
 * 一条任务在它存在的整段时间里，坐标是写死的：任务栏那句话不会变。所以
 * 「同一个第 N 个」+「不同的坐标」这个组合在游戏里不存在，只可能是 OCR 把某一位
 * 数字认错了——典型是 NPC 走过去盖住了一个字符。
 *
 * 这条比「连稳三帧」强，是因为遮挡会**持续**：人站在任务栏前面不走，错读能连着
 * 十几帧都一样，光靠帧数永远等不到它自己变回去。而序号在那一行里是最靠前、
 * 最少被挡的部分，通常还读得对，正好拿来当这个否决票。
 *
 * 反过来「序号变了」不作为立刻换的依据：糊掉的那一帧往往整行都乱，序号一起错，
 * 那时候它和真换了任务长得一模一样，只能交回三帧确认去分。
 */
function sameTaskNewCoords(current: ParsedTask, incoming: ParsedTask): boolean {
    return (
        current.index !== null &&
        incoming.index !== null &&
        current.index === incoming.index &&
        (current.x !== incoming.x || current.y !== incoming.y)
    );
}

function adopt(task: ParsedTask, score: number, now: number): Held {
    return { task, score, seenAt: now, pendingKey: '', pendingCount: 0 };
}

/**
 * 把这一帧读到的任务并进保留区。
 *
 * 五种情况分开处理，顺序不能换：
 *
 * 1. 一样的内容 → 只刷新时刻（界面上的「Ns 前」归零）；
 * 2. 更完整 → 立刻换（好结果可能只出现一帧，等确认等于丢掉它）；
 * 3. 更残缺 → 不动，**除了天眼推进**（「附近」消失本身就是降分，见 `revealStep`）；
 * 4. 同分但换了图 / 读到 `处` 开了天眼 → 立刻换（见 `switchedMap` / `revealStep`）；
 * 5. 其余同分不同内容 → 见 `sameTaskNewCoords` 与 `CONFIRM_FRAMES`；
 *    其中「`附近` 两个字消失」这一种按 `REVEAL_SILENT_FRAMES` 两帧确认。
 */
export function absorbFrame(hold: HoldState, tasks: ParsedTask[], now: number): void {
    const fresh = new Map<TaskKind, ParsedTask>();
    for (const task of tasks) {
        // 同一帧抓到两条同类型的（任务多时会出现）只取第一条：界面就两个位置，
        // 第三条既放不下也没法在图上区分。
        if (!fresh.has(task.kind)) fresh.set(task.kind, task);
    }

    for (const kind of SLOTS) {
        const incoming = fresh.get(kind);
        // 这一帧压根没读到这条：留着上一次的。任务栏滚动、折行变化、整行被挡住
        // 都会造成这种缺行，把它当成「任务没了」会让图闪一下再回来。
        if (!incoming) continue;

        const score = scoreTask(incoming);
        const current = hold[kind];

        if (!current) {
            hold[kind] = adopt(incoming, score, now);
            continue;
        }

        const key = taskKey(incoming);
        if (key === taskKey(current.task)) {
            current.seenAt = now;
            current.pendingKey = '';
            current.pendingCount = 0;
            continue;
        }
        if (score > current.score) {
            hold[kind] = adopt(incoming, score, now);
            continue;
        }
        // 降分是常态（糊掉的一帧），唯一的例外是天眼推进——「附近」两个字消失本身
        // 就是一次降分，所以要在「更残缺一律不动」之前放行。
        const step = revealStep(current.task, incoming);
        if (score < current.score && step === 0) continue;
        if (switchedMap(current.task, incoming) || step === 1) {
            hold[kind] = adopt(incoming, score, now);
            continue;
        }
        // 同一件事的坐标不会变，所以这一帧是误读——连稳多少帧都不采纳。
        if (sameTaskNewCoords(current.task, incoming)) continue;

        // 待定计数只认「同一套内容连续出现」：中间夹一帧读回原样或夹一帧别的读法，
        // 都要从头数起——半途中断的连续不算连续。
        const need = step > 1 ? step : CONFIRM_FRAMES;
        current.pendingCount = current.pendingKey === key ? current.pendingCount + 1 : 1;
        current.pendingKey = key;
        if (current.pendingCount >= need) hold[kind] = adopt(incoming, score, now);
    }
}

/** 每条任务各自多久没被读到（秒），逐槽位记，互不影响。 */
export function holdAges(hold: HoldState, now: number): Record<TaskKind, number> {
    const ages: Record<TaskKind, number> = { small: 0, big: 0 };
    for (const kind of SLOTS) {
        const item = hold[kind];
        if (item) ages[kind] = Math.round((now - item.seenAt) / 1000);
    }
    return ages;
}

/** 还有没有槽位在待定。界面据此显示「识别中」。 */
export function isSettling(hold: HoldState): boolean {
    return SLOTS.some((kind) => (hold[kind]?.pendingCount ?? 0) > 0);
}

/** 按槽位顺序取出保留的任务，供上层做 `planFor`。 */
export function heldTasks(hold: HoldState): ParsedTask[] {
    return SLOTS.map((kind) => hold[kind]?.task).filter((task): task is ParsedTask =>
        Boolean(task),
    );
}
