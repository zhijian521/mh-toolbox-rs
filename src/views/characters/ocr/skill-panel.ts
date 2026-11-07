import { schoolSkillCap } from '../../../services/game-data';
import type { CharacterData, SkillRow } from '../character';
import { schoolSkillNames, schoolSkills } from '../schools';
import type { OcrLine, OcrState } from './attr-panel';

/**
 * 把「师门技能面板」的一次 OCR 结果解析成七项技能的等级。
 *
 * 与 `attr-panel.ts` 同一套做法：吃带坐标的文本行、吐「哪一项读到了什么」，
 * 不碰 DOM、不碰 IPC——所以能单测。
 *
 * ---- 两种版式，两条线索 ----
 * 2026-11-07 用户给了两张图，是同一个面板的两种皮肤：
 *
 * | 版式 | 长什么样 | 有什么 |
 * | --- | --- | --- |
 * | 深蓝列表 | 竖排七行，每行「图标 名字」，等级在名字**下面一行** | 名字 + 等级 |
 * | 米黄格子 | 菱形七格，每格只有「图标」，等级在图标**正下方** | 只有等级 |
 *
 * 米黄那张**一个技能名都没有**——那一屏是「主技能」页，没点中任何一格，右侧说明区空着。
 * 所以它只能靠图标认：`OcrDialog` 先把七枚图标与图标库比对（`matcher.ts`），
 * 把「这一格是哪个技能」告诉这里，这里再给每格配上它下方的那个数。
 *
 * ---- 为什么位置不能代替名字 ----
 * 实测两张图，七格在**画面上的顺序**与技能表顺序并不一致：米黄那张是
 * 「乾坤袖 / 修仙术 / 周易学 / 潇湘仙雨 / 混元道果 / 明性修身 / 七星遁」，
 * 深蓝那张列表是「周易学 / 潇湘仙雨 / 乾坤袖 / 修仙术 / 混元道果 / 明性修身 / 七星遁」。
 * 拿「第 n 格 = 第 n 项」去套，前四项全错、而且不报错——所以只认名字与图标，
 * **绝不按位置推**。
 */

/** 一项技能的识别结果。 */
export interface SkillHit {
    name: string;
    /** 认出来的等级；`state` 不是 `ok` / `guess` 时这里是 0（不写回卡上）。 */
    level: number;
    state: OcrState;
    /** 用到的那几行里最低的置信度；`0` 表示没找到。 */
    score: number;
}

export interface SkillPanelResult {
    /** 长度恒等于该门派的技能数（7），顺序就是 `schools.json` 里的顺序。 */
    rows: SkillHit[];
    hit: number;
    total: number;
}

/** 一枚已经比对出来的图标。`matcher.ts` 产出，本文件只消费。 */
export interface IconHit {
    /** 该门派的技能名。 */
    name: string;
    /** 归一化互相关，0~1。 */
    score: number;
    box: { x: number; y: number; width: number; height: number };
}

/* ======================================================================
 * 名字比对
 * ==================================================================== */

/**
 * 形近字表——OCR 在 12~16px 的中文上最常错的几对。
 *
 * 只收**实测撞见过**的：「七星遁」被读成「七星适」（遁 → 适），其余几条来自
 * 「师门」与门派名那两处踩过的（责/贝 → 贡、カ → 力）。
 * 收得越多越危险：这张表是用来「救一个字」的，不是用来猜的，每加一条都要有截图做依据。
 */
const CONFUSABLE: Record<string, string> = {
    遁: '适',
    适: '遁',
    贡: '责',
    责: '贡',
    力: 'カ',
};

/** 把容易混的字统一到同一个写法，只用于比较，不改写名字。 */
function fold(text: string): string {
    return [...text].map((char) => CONFUSABLE[char] ?? char).join('');
}

/** 编辑距离。名字只有两三个字，朴素实现足够。 */
function distance(a: string, b: string): number {
    const left = [...a];
    const right = [...b];
    let prev = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        const next = [i];
        for (let j = 1; j <= right.length; j += 1) {
            next[j] = Math.min(
                prev[j] + 1,
                next[j - 1] + 1,
                prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
            );
        }
        prev = next;
    }
    return prev[right.length];
}

/**
 * 一行文字像不像某个技能名。
 *
 * 返回 0~1：`1` 完全相同，`0.8` 只差一个字（形近字折叠之后再差一个字），
 * `0.6` 一方包含另一方（检测框把名字切掉一截，或者带进了旁边的图标名）。
 * 0 表示不像。
 *
 * **不做「长度差很多也算包含」**：技能名两三个字，「学」包含在「周易学」里、
 * 也包含在「修仙术」……一旦放宽，七项会互相抢行。
 */
function likeness(text: string, name: string): number {
    const a = fold(text.trim());
    const b = fold(name);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length === b.length && distance(a, b) === 1) return 0.8;
    if (a.length > b.length && a.includes(b)) return 0.6;
    if (b.length > a.length && a.length >= 2 && b.includes(a)) return 0.6;
    return 0;
}

/* ======================================================================
 * 配对
 * ==================================================================== */

/** 一行「纯数字」的等级。技能上限 180，但截图上偶尔会把「120」读成「12O」，那种不算。 */
function levelOf(line: OcrLine): number | undefined {
    const text = line.text.trim();
    if (!/^\d{1,3}$/.test(text)) return undefined;
    const value = Number(text);
    return value >= 1 && value <= 200 ? value : undefined;
}

interface Anchor {
    /** 锚点矩形：名字行，或者图标框。数字要在它**下方**。 */
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 给一个锚点找它下方的那个数。
 *
 * 两张图验证过的空间关系：数字紧贴在锚点下面、水平方向有重叠。
 *   - 深蓝列表：名字底 `y=95`，等级顶 `y=97`，左边缘对齐；
 *   - 米黄格子：图标底 `y=117`，等级顶 `y=125`，**水平居中对齐**。
 *
 * 所以判据只有两条：垂直距离 ≤ 锚点高的 1.2 倍、水平方向有交集；
 * 满足的里面取 y 最近的一个。两个都对不上就是没认到——**不猜**。
 */
function pickLevel(anchor: Anchor, pool: { line: OcrLine; value: number }[]): number | undefined {
    const left = anchor.x;
    const right = anchor.x + anchor.width;
    const bottom = anchor.y + anchor.height;
    let best: { value: number; gap: number } | undefined;
    for (const one of pool) {
        const line = one.line;
        const overlap = Math.min(right, line.x + line.width) - Math.max(left, line.x);
        if (overlap < Math.min(8, line.width * 0.5)) continue;
        const gap = line.y - bottom;
        if (gap < -line.height * 0.5 || gap > anchor.height * 1.2) continue;
        if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { value: one.value, gap };
    }
    return best?.value;
}

/* ======================================================================
 * 解析
 * ==================================================================== */

/**
 * 认七项师门技能。
 *
 * `names` 是该门派的技能名（`schoolSkillNames(character.school)`）。**认门派是调用方
 * 的事**：面板上没写门派，光看图推不出该是那七项，硬猜只会把别家的名字套上去。
 *
 * `icons` 是可选的：有图标比对结果时用它补名字路线没认到的项（米黄版式全靠它）。
 */
export function parseSkillPanel(
    lines: readonly OcrLine[],
    names: readonly string[],
    icons: readonly IconHit[] = [],
): SkillPanelResult {
    const pool = lines
        .map((line) => ({ line, value: levelOf(line) }))
        .filter((one): one is { line: OcrLine; value: number } => one.value !== undefined);

    /* 每个名字挑一行：得分最高的那一行归它。冲突（两个名字抢同一行）时高分者得，
     * 同分时先到先得——技能表顺序在前的那一项更可能是真的。 */
    const taken = new Set<OcrLine>();
    const found = new Map<string, { line: OcrLine; score: number; state: OcrState }>();

    for (const name of names) {
        let best: { line: OcrLine; score: number } | undefined;
        for (const line of lines) {
            if (taken.has(line)) continue;
            const score = likeness(line.text, name);
            if (score > 0 && (!best || score > best.score)) best = { line, score };
        }
        if (best) {
            taken.add(best.line);
            found.set(name, {
                line: best.line,
                score: best.score,
                state: best.score >= 1 ? 'ok' : 'guess',
            });
        }
    }

    /* 名字路线没认到的那几项，交给图标。图标只信 0.5 以上：
     * 实测正确匹配落在 0.63~0.81，同门派的第二名最高 0.60——0.5 是「明显低于正确匹配、
     * 又高于随机」的那条线，认错的代价是等级写到别人名下，比不写更糟。 */
    const iconBest = new Map<string, IconHit>();
    for (const icon of icons) {
        if (icon.score < 0.5) continue;
        const old = iconBest.get(icon.name);
        if (!old || icon.score > old.score) iconBest.set(icon.name, icon);
    }

    const rows = names.map((name): SkillHit => {
        const byName = found.get(name);
        const byIcon = iconBest.get(name);
        /* 名字与图标都指向同一项时，锚点取**名字那一行**：等级就在它下面，
         * 不必跨到图标那一格去够，也不受图标框测偏的影响。 */
        const anchor: Anchor | undefined = byName?.line ?? byIcon?.box;
        const level = anchor ? pickLevel(anchor, pool) : undefined;
        if (level === undefined) {
            return { name, level: 0, state: 'miss', score: 0 };
        }
        const state: OcrState = byName ? byName.state : 'guess';
        const score = byName ? byName.score : (byIcon?.score ?? 0);
        return { name, level, state, score };
    });

    return {
        rows,
        hit: rows.filter((row) => row.state === 'ok' || row.state === 'guess').length,
        total: rows.length,
    };
}

/**
 * 把认出来的等级写回角色。
 *
 * 两条规矩与属性那边一致：
 *   1. **只写认出来的项**，`miss` 整项跳过——没认到不等于「0 级」；
 *   2. 顺序与 `cap` 仍由 `schoolSkills()` 定，这里只改 `level`。
 *
 * 注意 **`0` 是合法等级**（没练过），所以这里只按状态过滤、不按值过滤：
 * 写成 `!hit.level` 会把用户亲手填的 0 一起丢掉。
 *
 * 门派未知时（`schoolSkillNames` 返回 `undefined`）原样返回：没有门派就不知道
 * 该有哪七项，此时 `parseSkillPanel` 也拿不到 `names`，两边一致。
 */
export function applySkillPanel(
    character: CharacterData,
    rows: readonly SkillHit[],
): CharacterData {
    if (!schoolSkillNames(character.school)) return character;
    const byName = new Map(rows.map((row) => [row.name, row]));
    const base = schoolSkills(character.school, character.skills);
    return {
        ...character,
        skills: base.map((row): SkillRow => {
            const hit = byName.get(row.name);
            if (!hit || (hit.state !== 'ok' && hit.state !== 'guess')) return row;
            return { ...row, level: hit.level, cap: row.cap ?? schoolSkillCap() };
        }),
    };
}
