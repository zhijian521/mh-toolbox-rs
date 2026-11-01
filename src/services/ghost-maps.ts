/**
 * 地图底图清单。
 *
 * 数据源是 `public/maps/maps.json`，与 `public/maps/*.webp` 一起由
 * 一次性的切图脚本产出（脚本在项目外，未入库；新增地图时重跑）。
 *
 * 为什么不把这份清单写成 TS 常量：它和底图文件必须同步——加一条没有对应
 * webp 的记录，运行到那张图时才 404。放在同一个目录下，至少「改一份忘一份」
 * 的窗口期只有一次编辑动作。
 */

export interface GhostMap {
    id: string;
    /** 游戏内场景名。OCR 读到的就是它，匹配以此为准。 */
    name: string;
    /** 截图时用的文件名与游戏原文不一致时的兼容写法（如「建业城」）。 */
    aliases?: string[];
    maxX: number;
    maxY: number;
    img: string;
    /** 该场景任务栏坐标恒为 `0,0`（无坐标域），只能走「全层热区」降级。 */
    noCoord?: boolean;
}

interface MapFile {
    maps: GhostMap[];
}

let cache: Promise<GhostMap[]> | null = null;

/**
 * 加载一次，之后复用。失败时返回空数组，让界面显示「底图没加载上」而不是白屏。
 *
 * **失败不留在缓存里**：把 reject 过的 promise 一直存着，等于 dev server 抖一下
 * 就把「没有底图」永久钉死——之后每一帧都拿空清单，地名就算读对了也匹配不上，
 * 只能刷新页面才恢复。清掉缓存，下一次调用（下一帧 / 重开这一页）就会重试。
 */
export function loadGhostMaps(): Promise<GhostMap[]> {
    if (!cache) {
        cache = fetch(`${import.meta.env.BASE_URL}maps/maps.json`)
            .then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json() as Promise<MapFile>;
            })
            .then((file) => file.maps)
            .catch((error: unknown) => {
                console.error('地图清单加载失败', error);
                cache = null;
                return [];
            });
    }
    return cache;
}

/**
 * 实测的形近误读组：同一组里的字视为同一个字。
 *
 * 不引通用形近字库。通用库会把「日/曰」「未/末」这类正常地名里本来就有的字
 * 也归一掉，产生看不见的误配；这里每条都来自真机原文（2026-11-01 那批），
 * 新发现再加一组，加之前先确认归一后不会与别的地名撞。
 *
 * `碗腕` 与 `子孑` 就是「碗子山」被读成「腕孑山」那一次——两个字同时错，
 * 「差一个字」那档救不了，而人一眼就能认出来，因为错的是形近字。
 */
const CONFUSABLE = ['碗腕', '子孑'];

/** 把形近误读归一到组内的第一个字。幂等，对原文与清单名两边都做。 */
function canonical(text: string): string {
    let out = text;
    for (const group of CONFUSABLE) {
        const head = group[0];
        for (const ch of group.slice(1)) out = out.split(ch).join(head);
    }
    return out;
}

/**
 * 按 OCR 出来的场景名找地图。
 *
 * 四档，从严到宽，取**分数最高**的一条——不取「第一个命中的」，那等于让清单顺序
 * 决定送到哪张图：
 *
 * 1. 全等 / 别名全等 —— 绝大多数情况
 * 2. 形近字归一后全等 —— 「腕孑山」→「碗子山」，错两个字但错的是形近字
 * 3. 互相包含（短的一方至少 2 字）—— OCR 少读一个字、地名被折行截断
 *    （「建邺城」只读到「建邺」或「邺城」都算）
 * 4. 差一个字（地图名至少 2 字）—— 把「子」读成「孑」这类单处误识
 *
 * 2 字名同样走第 4 档：清单里只有「天宫」一个两字名，与它差一个字的两字串只能落到
 * 它身上；而「江南」这种差两处的，双指针在第一处放过之后立刻失败，不会被硬塞给天宫。
 *
 * **为什么敢放到「差一个字」**：20 张图两两之间至少差 2 个字（以「山」「村」「国」
 * 结尾的那几组，相同位置只有一个字重合），不存在「改一个字就变成另一张图」的组合，
 * 所以这一档不会把鬼送到隔壁地图上。新增地图时要重新核一遍这条前提。
 */
export function findGhostMap(maps: GhostMap[], text: string): GhostMap | null {
    const target = text.trim();
    if (!target) return null;

    let best: { map: GhostMap; score: number } | null = null;
    for (const map of maps) {
        const names = [map.name, ...(map.aliases ?? [])];
        const score = Math.max(...names.map((name) => scoreName(target, name)));
        if (score > (best?.score ?? 0)) best = { map, score };
    }
    return best?.map ?? null;
}

/** 分数只用来「谁更像」，绝对值没有含义；分档留出间隔，避免档内比较跨档。 */
function scoreName(target: string, name: string): number {
    if (target === name) return 1000 + name.length;
    // 形近字归一后全等，比「原文全等」低一档：能确定是它，但毕竟错了两处。
    if (canonical(target) === canonical(name)) return 900 + name.length;
    if (
        target.length >= 2 &&
        name.length >= 2 &&
        (name.includes(target) || target.includes(name))
    ) {
        // 命中的字越多越可信：「建邺」比「建」更像（后者进不来）。
        return 600 + Math.min(target.length, name.length);
    }
    if (name.length >= 2 && target.length >= 2 && differsByOne(target, name)) return 300;
    return 0;
}

/**
 * 是否恰好差一个字（替换 / 插入 / 删除）。
 *
 * 不写完整的编辑距离矩阵：只需要「差一个」这一档，双指针走一遍就够，
 * 而且顺序敏感的写法能顺手挡住「两个字错位」的假阳性。
 */
function differsByOne(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a === b) return false;
    const sameLength = a.length === b.length;
    const [short, long] = sameLength ? [a, b] : a.length < b.length ? [a, b] : [b, a];
    let i = 0;
    let j = 0;
    let skipped = false;
    while (i < short.length && j < long.length) {
        if (short[i] === long[j]) {
            i += 1;
            j += 1;
            continue;
        }
        if (skipped) return false;
        skipped = true;
        if (sameLength) {
            // 等长 = 一次替换，两边一起前进。
            i += 1;
            j += 1;
        } else {
            // 不等长 = 长串多一个字，只跳过长串这一位。
            j += 1;
        }
    }
    return true;
}
