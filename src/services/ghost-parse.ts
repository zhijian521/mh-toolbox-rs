import type { OcrLine } from './ghost';
import type { GhostMap } from './ghost-maps';
import { findGhostMap } from './ghost-maps';

/**
 * 任务栏文本 → 结构化任务。
 *
 * 全部是纯函数，不碰 Tauri、不碰网络。这样正则改了可以直接喂假文本重跑，
 * 不用开着游戏等一帧截图——这条是整个模块能被反复调对的前提。
 *
 * 三条从实测里换来的规则，写在这里免得后来者再踩一遍：
 *
 * ① **必须先拼成一整串再匹配**。面板宽度固定，任务栏会按像素自动折行，
 *    能折在括号里、折在鬼名里：
 *
 *    ```
 *    钟馗抓鬼（第1个          ← 括号被切开
 *    ）：去江南野外            ← 下一行从右括号开始
 *    134,54附近抓亥           ← 鬼名被切开
 *    时三刻偷尸鬼。
 *    ```
 *
 *    任何「逐行正则」的写法都会在这里漏。
 *
 * ② **数字与字母的混淆是系统性的**。`559` 在 1×~6× 六个放大倍率下稳定读成 `55q`，
 *    `93` 稳定读成 `q3`。不是随机噪声，所以纠错表能一次性解决；
 *    但也正因为它稳定，规则一变就会稳定地错，纠错必须留记录给界面显示。
 *
 * ③ **大小鬼两种句式，逗号的全半角不同**：小鬼 `去江南野外134,54`（半角、无「的」），
 *    大鬼 `去北俱芦洲的93，29`（全角、有「的」）。所以正则里逗号用字符类，
 *    「的」可选，不能写死任何一种。
 */

/** 小鬼走「钟馗抓鬼」，大鬼走「降服千年厉鬼」，场景完全不重叠。 */
export type TaskKind = 'small' | 'big';

/**
 * 天眼状态。四档全部由「坐标后面跟着什么」直接读出来。
 *
 * - `nearby`：读到 `附近` → 未开眼，任务栏给的是假坐标，画 ±50 范围；
 * - `exact`：读到 `处` → 已开眼；
 * - `silent`：坐标读到了，但后面既没有 `附近` 也没有 `处` → **已开眼**。
 *   游戏开天眼是把 `附近` 两个字**直接删掉**，句子变成
 *   `去江南野外134,54抓巳时四刻偷尸鬼。`，不给替代字；
 * - `unknown`：走的是兜底句式，那一层根本不捕获句尾，无从判断。
 *
 * `silent` 与 `unknown` 必须分开，混成一个会同时错两头：当成 `exact` 则每一条
 * 兜底解析出来的任务都画成一个点；当成 `unknown` 则开了天眼的任务永远停在
 * ±50 范围上，用户只能自己跑遍 100×100 格去找。
 */
export type RevealState = 'nearby' | 'exact' | 'silent' | 'unknown';

export interface ParsedTask {
    kind: TaskKind;
    /** 第几个。OCR 丢了数字时为 `null`，不影响画图。 */
    index: number | null;
    /** 匹配到的底图。地名对不上时为 `null`，此时只能显示文本。 */
    map: GhostMap | null;
    /** OCR 读到的地名原文，即使没匹配上底图也留着，便于排查。 */
    mapText: string;
    x: number;
    y: number;
    reveal: RevealState;
    /** 匹配到的整段原文，界面折叠显示。 */
    raw: string;
}

export interface Correction {
    from: string;
    to: string;
}

export interface ParseReport {
    /**
     * 按 y 排好序的逐行原始识别结果。
     *
     * 拼成一整串再跑正则，但**拼接对不对只有对着折行原样才看得出来**。
     * 界面上把行原样列出，一眼就知道那个地名是被这一行拦腰切断的，
     * 还是两行本来就这样。（拼好的那串只在函数内部活着，没有第二个消费者，
     * 就不往外传了。）
     */
    lines: string[];
    tasks: ParsedTask[];
    corrections: Correction[];
    /**
     * 这一帧要打的招呼。为空才是干净的。
     *
     * 两种来源：一是**没解析出来**（读到「抓鬼 / 厉鬼」却没出坐标、地名没有底图），
     * 二是**解析出来了但有保留**（假坐标越出该图值域，图会按贴边画）。
     * 后者不是失败，别把它当错误信息去缩窄正则。
     */
    issues: string[];
}

/**
 * 字母 → 数字的纠错表。
 *
 * 只列实测出现过的混淆，不做「把所有字母都试一遍」的穷举：穷举会把地名里的
 * 真字母也改掉，而且错得更隐蔽。新发现一种再加一条。
 *
 * **顺序无关**，可以随便追加：每条的输入集合互不相交，输出是数字，
 * 而没有任何一条会再匹配数字。（早先有一条 `[a-z]` 通配规则，那时候的 `l→1`
 * 必须排在它前面；那条规则删掉之后这个约束也不存在了。）
 */
const DIGIT_FIXES: Array<[RegExp, string]> = [
    [/[qQ]/g, '9'],
    [/[oO]/g, '0'],
    [/[gG]/g, '9'],
    [/[bB]/g, '8'],
    [/[sS]/g, '5'],
    [/[zZ]/g, '2'],
    [/[lI|!]/g, '1'],
];

/**
 * 两种任务的正则。
 *
 * `.{1,12}?` 是地名长度上限：最长的是「地狱迷宫三层」（6 字），加「的」7 字，
 * 12 留足余量。加下限是因为 `(?P<map>.+?)` 在残句里会一路吃到别的地方的数字。
 *
 * `[（(]?` 与 `[）)]?` 都可选：括号是最容易被 OCR 吃掉或切成半角的字符之一，
 * 而它的存在与否对语义毫无影响。
 *
 * 下面这几处「松」不是预防性写法，是 2026-10-31 真机识别结果逼出来的
 * （样本见 `tools/probe/fixtures/ghost-ipc.js` 的 `real` 档）：
 *
 * - `[钟锺]?[馗旭]?抓鬼`：3× 放大时「钟馗抓鬼」稳定读成「馗抓鬼」，首字被吃掉；
 *   4× 读成「钟旭抓鬼」。
 * - `降?服?千年厉鬼`：真机帧 6、8 直接读成 `服千年厉鬼`，「降」整字消失。
 *   写成 `降服?` 要求句首必须是「降」，两帧都漏；现在两个前缀字都可选，
 *   「千年厉鬼」本身当锚点。帧 7 连「年」都丢了（`千厉鬼`），那才交给兜底。
 * - 括号一类：`[（(〈]`。真机出现过 `霉馗抓鬼〈第1个`，`〈` 把「（」顶掉了。
 * - `第[^\d]{0,2}(\d{0,3})个`：2×~4× 都出现过「第独“1个」这种把括号当字的读法，
 *   要求「第」后面紧跟数字就会整条漏掉。
 * - **「个」与「去」之间允许 0~2 个非数字字符**（`[^\d]{0,2}`）：这一段在真机上
 *   被读出过 `）．`、`）《`、`丨：`、`）的` 等各种形状。早先只放行一个「像冒号的
 *   字符」，`（第1个）《去` 就因为多了一个书名号整条漏掉。
 * - 坐标之间的分隔符 `[,，、．.]`：逗号被读成顿号、句号、小数点都出现过。
 *   只扩字符类不改结构——分隔符**不能**写成可选，否则 `(\d{1,4})` 贪婪
 *   会把两段数字连成的六位数整个吃掉，反而更难救。
 * - 分隔符**后面**允许 1 个非数字字符，但**不能再是分隔符**：
 *   `[^\d,，、．.]{0,1}`。真机出现过 `36，一145`（多一个「一」）需要放行；
 *   而 `36，，45` 是 `36，145` 把「1」读成了逗号，若放行就得到 `36,45`——一个
 *   看起来完全合法、实际错 100 格的坐标——没有任何外部约束拦得住它（值域只能
 *   提示越界，不能否决，理由见 `collect` 里那段）。这种帧宁可判失败，
 *   让「保留最佳」继续顶着上一帧的正确值。
 */
const SMALL_PATTERN =
    /[钟锺]?[馗旭]?抓鬼[（(〈]?第[^\d]{0,2}(\d{0,3})个[）)〉]?[^\d]{0,2}去(.{1,12}?)(\d{1,4})[,，、．.][^\d,，、．.]{0,1}(\d{1,4})(附近|处)?/;
const BIG_PATTERN =
    /降?服?千年厉鬼[（(〈]?第[^\d]{0,2}(\d{0,3})个[）)〉]?[^\d]{0,2}去(.{1,12}?)的?(\d{1,4})[,，、．.][^\d,，、．.]{0,1}(\d{1,4})(附近|处)?/;

/**
 * 兜底句式：只保留「抓鬼 / 厉鬼」这个锚点，加上「去或它的误读」与坐标。
 *
 * 上面两条严格正则都要求句首那几个字大致成型，而真机上它们会整个走样：
 * 「降服千年厉鬼」被读成 `挚月艮千厉鬼`（帧 7），「钟馗抓鬼」被读成 `中旭抓鬼`、
 * `霉馗抓鬼`。「去」也被读成过「昊」。
 *
 * 所以这一层不做结构校验，只要求：**同一串里出现锚点、一个「去/昊」、一对坐标**，
 * 并且「去」之前的字符里不含「去」（`[^去]{0,12}?`）——这条约束保证锚点与坐标
 * 属于同一条任务，不会一路吃到下一条上去。
 *
 * 它**只在严格正则一条都没匹配到时启用**（见 `collect`），所以误配的风险全部
 * 落在「本来就没结果」的局面里，不会把已经读对的那条挤掉。
 */
const LOOSE_SMALL =
    /抓鬼[^去]{0,12}?(?:去|昊)(.{1,12}?)(\d{1,4})[,，、．.][^\d,，、．.]{0,1}(\d{1,4})/;
const LOOSE_BIG =
    /厉鬼[^去]{0,12}?(?:去|昊)(.{1,12}?)(\d{1,4})[,，、．.][^\d,，、．.]{0,1}(\d{1,4})/;

/**
 * 第三层：分隔符整个没了的坐标。
 *
 * 任务栏折行**正好落在逗号上**时，逗号落在行尾被裁掉，两段数字在拼接后粘成
 * 一串（2026-11-01 真机实测）：
 *
 * ```
 * 降服千年厉鬼（第8个
 * 去麒麟山的119
 * 107附近降服子时
 * ```
 *
 * 拼成一整串是 `去麒麟山的119107附近`。这一帧上面两层都救不了：严格正则要求
 * 分隔符，兜底也一样；而**把分隔符写成可选更糟**——`(\d{1,4})` 贪婪会给出
 * `1191` + `07` 这种看着合法、实际错几十格的读法，没有任何正则内部的信息能
 * 分辨它。
 *
 * 所以这一层的匹配只负责「锚点 + 地名 + 一串纯数字」，切分交给
 * `splitCoordDigits()`，靠**这张图的坐标值域**定夺。
 */
const NOSEP_SMALL = /抓鬼[^去]{0,12}?(?:去|昊)(.{1,12}?)的?(\d{4,7})(附近|处)?/;
const NOSEP_BIG = /厉鬼[^去]{0,12}?(?:去|昊)(.{1,12}?)的?(\d{4,7})(附近|处)?/;

/**
 * 把粘连的数字串切成两段坐标。
 *
 * 判据只有一条：**切完之后 x ≤ maxX 且 y ≤ maxY**。这条判据出奇地硬——
 * 20 张图里 maxX 最大 640、maxY 最大 210，都是三位数：
 *
 * | 位数 | 可能的切法 | 结果 |
 * | --- | --- | --- |
 * | 6 位 `119107` | 1+5 / 2+4 / 3+3 / 4+2 / 5+1 | 只有 3+3 能让两轴都不爆值域 |
 * | 5 位 `13454`  | 1+4 / 2+3 / 3+2 / 4+1     | 4 位那段必爆，通常只剩 3+2 |
 * | 4 位 `1234`   | 1+3 / 2+2 / 3+1            | 取两段长度差最小的 2+2 |
 *
 * 值域筛不唯一时用「两段等长」（长度差最小）定；还不唯一就**放弃**，宁可这
 * 一帧不出结果、让「保留最佳」顶着上一帧，也不要给一个错几十格的坐标。
 *
 * 前导零只允许 `0` 本身：`07` 不可能是坐标，它只说明切错了。
 */
function splitCoordDigits(digits: string, map: GhostMap | null): { x: number; y: number } | null {
    // 地名没对上底图就没有值域可用，这时唯一的依据是「两段等长」，而等长恰恰
    // 是最容易被推翻的猜测。直接放弃，别在没底图的情况下编一个坐标出来。
    if (!map) return null;

    const options: Array<{ x: number; y: number; gap: number }> = [];
    for (let cut = 1; cut < digits.length; cut += 1) {
        const head = digits.slice(0, cut);
        const tail = digits.slice(cut);
        const leadingZero = (part: string) => part.length > 1 && part.startsWith('0');
        if (leadingZero(head) || leadingZero(tail)) continue;
        const x = Number(head);
        const y = Number(tail);
        if (x > map.maxX || y > map.maxY) continue;
        options.push({ x, y, gap: Math.abs(head.length - tail.length) });
    }
    if (options.length === 0) return null;

    const minGap = Math.min(...options.map((option) => option.gap));
    const winners = options.filter((option) => option.gap === minGap);
    const [only] = winners;
    return winners.length === 1 && only ? { x: only.x, y: only.y } : null;
}

/** 把字母混淆改回数字，并记录改了哪些。 */
function normalize(raw: string): { text: string; corrections: Correction[] } {
    // 全串删空白：折行、字间空隙、OCR 插入的空格都会让数字被切开（`5 59`）。
    let text = raw.replace(/\s+/g, '');
    const seen = new Map<string, Correction>();
    for (const [pattern, digit] of DIGIT_FIXES) {
        text = text.replace(pattern, (match: string) => {
            seen.set(`${match}${digit}`, { from: match, to: digit });
            return digit;
        });
    }
    return { text, corrections: [...seen.values()] };
}

/**
 * 把地名洗成只剩汉字。
 *
 * 地名不可能是别的字符。OCR 会把引号、竖线、书名号、`·` 混进来——真机帧里出现过
 * `）《去'建邺城`、`| 近降服`、`王 · 剩 余`。这些字符留着只会让地名匹配失败，
 * 因为它们本来就不属于地名，删掉零风险。
 *
 * 首部的「去」与尾部的「的」也削掉：兜底正则把「去」当锚点，它偶尔会落进地名里。
 */
function cleanMapText(text: string): string {
    return text
        .replace(/[^\u4e00-\u9fa5]/g, '')
        .replace(/^[去的]+/, '')
        .replace(/的+$/, '');
}

/**
 * 句尾 → 天眼状态。
 *
 * 空串与 `undefined` 必须区别对待，这是这一层唯一的坑：
 * 严格句式的 `(附近|处)?` 是可选组，没匹配上是 `''`（调用方 `?? ''` 归一），
 * 表示「坐标读到了，后面确实什么都没有」；而兜底句式压根没有这个捕获组，
 * 传进来是 `undefined`，表示「这一段没看」。
 *
 * 把 `undefined` 也当成「没有附近」，会让每一条兜底解析的任务都变成精确点——
 * 而兜底恰恰是最不确定的那一类帧。
 */
function revealOf(tail: string | undefined): RevealState {
    if (tail === '附近') return 'nearby';
    if (tail === '处') return 'exact';
    if (tail === '') return 'silent';
    return 'unknown';
}

function buildTask(
    kind: TaskKind,
    indexText: string | undefined,
    rawMapText: string,
    xText: string,
    yText: string,
    tail: string | undefined,
    raw: string,
    maps: GhostMap[],
): ParsedTask {
    const mapText = cleanMapText(rawMapText);
    return {
        kind,
        index: indexText ? Number(indexText) : null,
        map: findGhostMap(maps, mapText),
        mapText,
        x: Number(xText),
        y: Number(yText),
        reveal: revealOf(tail),
        raw,
    };
}

/**
 * 解析一帧的识别结果。
 *
 * `lines` 不必已排序——这里自己按 `y` 排一次，因为排序是「拼接顺序」的前提，
 * 放在调用方容易被忘掉。
 */
export function parseGhostTasks(lines: OcrLine[], maps: GhostMap[]): ParseReport {
    const ordered = [...lines].sort((a, b) => a.y - b.y);
    const joined = ordered.map((line) => line.text).join('');
    const { text, corrections } = normalize(joined);

    const tasks: ParsedTask[] = [];
    const issues: string[] = [];

    // 对整串做**全局**匹配：同一帧里可能同时抓到两条小鬼（任务多时）或
    // 一条小鬼加一条大鬼。用 `exec` 循环而不是只取第一次。
    const collect = (
        strict: RegExp,
        loose: RegExp,
        noSep: RegExp,
        kind: TaskKind,
        marker: string,
    ) => {
        const scan = new RegExp(strict.source, 'g');
        let hit = scan.exec(text);
        let matched = 0;
        let kept = 0;
        while (hit) {
            matched += 1;
            // `?? ''` 是语义转换，不是防空：可选组没匹配上时 `exec` 给的是
            // `undefined`，而这里要表达的恰恰是「确认没有句尾」（见 `revealOf`）。
            const task = buildTask(
                kind,
                hit[1],
                hit[2],
                hit[3],
                hit[4],
                hit[5] ?? '',
                hit[0],
                maps,
            );
            // 坐标落在该图值域外**不丢**。任务栏给的是假坐标：游戏按真实位置的
            // ±50 随机、不按地图边界裁剪，所以真身贴着右边时提示坐标本身就会越过
            // maxX（2026-11-01 实测普陀山 96×72 读到 100,66）。早先按「OCR 认错一位」
            // 一律丢弃，等于把一条本来能用的任务判成没读到。
            //
            // 但它也确实**可能是**认错一位，所以给图一个处置口径：按贴边画
            // （见 `ghost-model.ts` 的 `clamp`），并把这件事留在「识别原文」里。
            if (task.map && (task.x > task.map.maxX || task.y > task.map.maxY)) {
                issues.push(
                    `「${task.mapText}」坐标 ${task.x},${task.y} 超出该图值域 ` +
                        `${task.map.maxX}×${task.map.maxY}，按贴边画`,
                );
            }
            tasks.push(task);
            kept += 1;
            hit = scan.exec(text);
        }

        // 严格句式一段都没命中才上后两层。命中过就不再往下兜——否则同一段会被
        // 松一层的规则再解析一遍，得到两条一模一样的任务。
        if (matched === 0) {
            const looseHit = new RegExp(loose.source).exec(text);
            if (looseHit) {
                tasks.push(
                    buildTask(
                        kind,
                        undefined,
                        looseHit[1],
                        looseHit[2],
                        looseHit[3],
                        // 第 6 个参数留 `undefined` 而不是 `''`：兜底句式没捕获句尾，
                        // 是「没看」不是「没有」，据此判天眼会把最糊的帧画成精确点。
                        undefined,
                        looseHit[0],
                        maps,
                    ),
                );
                kept += 1;
            } else {
                const noSepHit = new RegExp(noSep.source).exec(text);
                if (noSepHit) {
                    const rawMapText = noSepHit[1];
                    const digits = noSepHit[2];
                    const found = findGhostMap(maps, cleanMapText(rawMapText));
                    const point = splitCoordDigits(digits, found);
                    if (point) {
                        // 句尾只在**明确读到字**时才带出去。这一层本来就缺了逗号、
                        // 是残帧，再让它去判「附近消失了 = 开了天眼」就成了拿最不
                        // 可信的帧下最不可逆的结论；读不到就留 `undefined`（unknown），
                        // 照常画范围。
                        const tail = noSepHit[3];
                        tasks.push(
                            buildTask(
                                kind,
                                undefined,
                                rawMapText,
                                String(point.x),
                                String(point.y),
                                tail === '附近' || tail === '处' ? tail : undefined,
                                noSepHit[0],
                                maps,
                            ),
                        );
                        issues.push(
                            `「${cleanMapText(rawMapText)}」坐标缺分隔符，已按值域切成 ` +
                                `${point.x},${point.y}`,
                        );
                        kept += 1;
                    } else if (found) {
                        // 有底图却切不开：`119107` 这种要么是更长的误读，要么两轴
                        // 都超过了这张图。不猜，留给「保留最佳」顶着上一帧。
                        issues.push(
                            `「${cleanMapText(rawMapText)}」坐标 ${digits} 没有分隔符，` +
                                `按该图值域切不出唯一解`,
                        );
                    }
                }
            }
        }

        if (kept === 0 && text.includes(marker)) {
            issues.push(`读到「${marker}」但没能解析出地图与坐标`);
        }
    };

    collect(SMALL_PATTERN, LOOSE_SMALL, NOSEP_SMALL, 'small', '抓鬼');
    collect(BIG_PATTERN, LOOSE_BIG, NOSEP_BIG, 'big', '降服');
    // 大鬼句首走样时连「降服」都不在（真机帧 7 读成「挚月艮千厉鬼」），
    // 上面按「降服」判断的那条提示不会触发，这里改用「厉鬼」补一次。
    // 两个条件互斥（一个是「有降服」，一个是「没降服」），不会重复报。
    if (!text.includes('降服') && text.includes('厉鬼') && !tasks.some((t) => t.kind === 'big')) {
        issues.push('读到「厉鬼」但没能解析出地图与坐标');
    }

    for (const task of tasks) {
        if (!task.map) {
            issues.push(`地名「${task.mapText}」没有对应的底图`);
        }
    }

    return { lines: ordered.map((line) => line.text), tasks, corrections, issues };
}
