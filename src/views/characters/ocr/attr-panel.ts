import type { AttrGroup, CharacterData } from '../character';
import { normalizeCharacter } from '../roster';
import { schoolSkills } from '../schools';
import { schoolNames } from '../../../services/game-data';
import { ATTR_LABELS as LABELS, ATTR_ORDER, RESOURCE_KEYS } from '../../../services/game-rules';

/**
 * 把「属性面板」的一次 OCR 结果解析成角色字段。
 *
 * 这一层是**纯函数**：吃的是一串带坐标的文本行，吐的是「哪一项读到了什么」。
 * 它不碰 DOM、不碰 IPC、不碰库；截图解析与应用数据可以分别维护。
 *
 * ---- 为什么靠坐标而不是靠正则拼一串 ----
 * 面板是**两列甚至四列**的格子（「命中 1915 体质 229」在同一行）。把所有行拼成
 * 一串再跑正则，会出现「命中读到 1915 和 229 两个数，取哪个」这种无法回答的问题；
 * 先按 y 聚成行、再按 x 排序，标签右边那一格是谁就没有歧义了。
 *
 * 只维护深蓝「人物属性」面板。仍按标签配对，避免截图裁边、缩放与 OCR 分框
 * 让固定像素坐标失效；棕色「人物状态」面板的标签别名不再兼容。
 */

/**
 * 一行识别结果。结构与 Rust 的 `TextLine` 一致，但只声明这里要用的部分。
 *
 * 不直接引 `services/bindings` 的类型：那是生成物，而本文件是纯逻辑，
 * 单测里造数据不该被「生成物还没重写过」牵连。
 */
export interface OcrLine {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * 0~1。**可能是 `null`**：specta 对 Rust 的 `f32` 一律生成 `number | null`
     * （JSON 装不下 NaN / Infinity，serde 会把它们写成 null）。这里照抄那个口径，
     * 用的时候统一 `?? 0`——「不知道分数」与「分数为 0」在界面上是同一句话：
     * 别太信这一行。
     */
    score: number | null;
}

/**
 * 一项识别结果的状态。
 *
 * `ok` / `guess` 会被写进卡片，`miss` / `bad` 不会——**「没认到」绝不能清空原值**：
 * 用户手上那张卡是完整的，截一张图只补几项，不该因为这次没框到「帮贡」就把它抹掉。
 */
export type OcrState = 'ok' | 'guess' | 'miss' | 'bad';

/**
 * 一格。
 *
 * `key` 是稳定的取值键：属性行直接用行名（`气血`），身份与经验那几项用英文
 * （`name` / `level` / `expValue`…），**写回卡上时按它找位置**。
 *
 * 这里**没有**「显示名」与「状态说明」两个字段（2026-11-07 Review 删的）：
 * 认出来的东西只有一处出口——右边那张卡。卡上的行名来自 `ATTR_GROUPS`、
 * 身份那四项在卡头，都不是识别层的事；「为什么这一项是猜的」那句原本给左栏的
 * 状态记号当 title，左栏撤掉之后它再没有读者，留着就是一条只写不读的字段。
 * 真要把它标到卡上（比如存疑的格子染赭），从 `state` 现生成，别把死字段请回来。
 */
export interface OcrField {
    key: string;
    /** OCR 读到的那一格原文（去掉标签），保留斜杠与空格——它是「为什么是这个值」的证据。 */
    raw: string;
    /** 规整之后的值。**写进卡上的就是它**，也是用户在卡上直接改的那一格。 */
    value: string;
    state: OcrState;
    /** 用到的那些行里最低的置信度；`0` 表示这一项根本没找到行。 */
    score: number;
}

export interface AttrPanelResult {
    fields: OcrField[];
    /** 认出（`ok` 或 `guess`）的项数。 */
    hit: number;
    /** 一共多少项（当前是 24）。 */
    total: number;
}

/* ======================================================================
 * 行与格
 * ==================================================================== */

interface Cell {
    text: string;
    x: number;
    score: number;
    height: number;
}

/**
 * 按 y 把行聚成「面板上的一排」。
 *
 * 判据是**两行的顶边相差不到半个字高**（`0.6 × 中位字高`，最少 4px）。
 *
 * ---- 为什么不是「中心线接近」----
 * 最初写的是中心线相差不到较矮那一行的一半高度，看着更「几何」，实测当场翻了：
 * 面板左边那排竖排页签（「修炼技能」高 54px，y 279~333）的中心是 306，
 * 而同一段右侧「速度」那一行的中心是 299.5——差 6.5px，小于 54 的一半，
 * 于是**速度被并进了竖排页签那一行**，成了它的「值」被丢掉；而「455」又因为
 * 差 6.5 不小于 13 的一半而自己起了一行，最后「速度」这一项直接读不到。
 *
 * 顶边就不会有这个问题：同一排的字是同一行基线渲染出来的，顶边几乎重合
 * （实测差值 0~6），而竖排页签与右边那一排差 12 以上。字高也用**全图中位数**
 * 而不是逐行取——竖排那个 54 会把逐行的阈值撑到 27，等于没判。
 */
function rowsOf(lines: readonly OcrLine[]): Cell[][] {
    const sorted = [...lines]
        .filter((line) => line.text.trim() !== '')
        .sort((one, two) => one.y - two.y || one.x - two.x);
    if (!sorted.length) return [];

    /* 中位字高：不受竖排页签那几条长框影响（它们是个位数，进不了中位）。 */
    const heights = sorted.map((line) => Math.max(1, line.height)).sort((one, two) => one - two);
    const median = heights[Math.floor(heights.length / 2)] || 16;
    const limit = Math.max(4, median * 0.6);

    const rows: OcrLine[][] = [];
    for (const line of sorted) {
        const row = rows[rows.length - 1];
        if (row && Math.abs(line.y - row[0].y) < limit) {
            row.push(line);
            continue;
        }
        rows.push([line]);
    }

    return rows.map((row) =>
        row
            .sort((one, two) => one.x - two.x)
            .map((line) => ({
                text: line.text.trim(),
                x: line.x,
                score: line.score ?? 0,
                height: line.height,
            })),
    );
}

/** 去掉空白与全角/半角标点：OCR 常在标签和值之间吐一个空格或冒号。 */
function tidy(text: string): string {
    return text
        .replace(/[\s\u3000]+/g, '')
        .replace(/^[：:·、,，.。]+/, '')
        .replace(/[：:·、,，。]+$/, '');
}

/**
 * 认一格的标签。
 *
 * 先整体 tidy 再比前缀——OCR 给的「气 血」不去空格永远匹配不上。
 *
 * 分三步，因为实测的三种错法各需一条：
 *   ① 原样能对上就对上（绝大多数）；
 *   ② **形近字**：「门贡」被读成「门责」（2026-11-07 那张深蓝面板就是这么错的，
 *      分数 0.80，一行里其它字全是 0.99+）。只在原样对不上时才纠，纠完再比一次；
 *   ③ **标签被切掉后半截**：「耐力」只剩「耐」。收的条件很严——只能是**唯一**
 *      一个标签以它开头，且它比标签短。于是「耐」→ 耐力、「速」→ 速度收下，
 *      而「体」（体质 / 体力）、「门」（门派 / 门贡）、「法」（法伤 / 法防）一律放过：
 *      猜错一个标签比漏掉一项更糟——漏掉的那项会显示成「没认到」，猜错的那项会
 *      **把别人的数写进另一行**，而两张卡上都看不出来。
 */
function matchLabel(text: string): { key: string | null; label: string; rest: string } | null {
    const compact = tidy(text);
    if (!compact) return null;

    const direct = findLabel(compact);
    if (direct) return direct;

    const fixed = compact.replace(/[责贝カ]/g, (char) => LABEL_FIXES[char] ?? char);
    if (fixed !== compact) {
        const second = findLabel(fixed);
        if (second) return second;
    }

    if (compact.length <= 2) {
        const candidates = LABELS.filter(
            (item) =>
                item.key !== null &&
                item.text.length > compact.length &&
                item.text.startsWith(compact),
        );
        if (candidates.length === 1) {
            return { key: candidates[0].key, label: candidates[0].text, rest: '' };
        }
    }
    return null;
}

/** 原样的前缀匹配，长标签先试。 */
function findLabel(compact: string): { key: string | null; label: string; rest: string } | null {
    for (const item of LABELS) {
        if (compact.startsWith(item.text)) {
            return { key: item.key, label: item.text, rest: compact.slice(item.text.length) };
        }
    }
    return null;
}

/**
 * 读错过的字形。**只收实测见到的**，不做全表模糊——每加一行都该有一张截图作证。
 *
 * `责 → 贡`：门贡 / 帮贡 的「贡」被读成「责」，这是 2026-11-07 两张面板里唯一
 * 反复出现的标签错。`贝 → 贡` 是同一个字形的另一种读法；`カ → 力` 是日文片假名
 * 「カ」与「力」在低分辨率下同形。
 */
const LABEL_FIXES: Record<string, string> = { 责: '贡', 贝: '贡', カ: '力' };

/**
 * 扫一遍所有行，收集「标签 → 原文」。
 *
 * 一格里可能是「标签 + 值」（`气血3916`），也可能是「标签」单独一格而值在右边；
 * 值还可能被检测切成两格（`大唐` + `芙蓉园`）。所以取值规则统一成：
 * **从这个标签之后，一直拼到下一个标签之前**。
 */
function collect(rows: readonly Cell[][]): Map<string, { raw: string; score: number }> {
    const found = new Map<string, { raw: string; score: number }>();

    for (const row of rows) {
        const hits = row.map((cell) => ({ cell, hit: matchLabel(cell.text) }));

        for (let index = 0; index < hits.length; index += 1) {
            const current = hits[index];
            if (!current.hit) continue;

            let raw = current.hit.rest;
            let score = current.cell.score;
            for (let next = index + 1; next < hits.length; next += 1) {
                if (hits[next].hit) break;
                raw += hits[next].cell.text;
                score = Math.min(score || 1, hits[next].cell.score || 1);
            }
            raw = tidy(raw);

            /* 同一标签重复出现时保留第一处，避免后续说明覆盖面板上的主值。 */
            if (current.hit.key && !found.has(current.hit.key) && raw !== '') {
                found.set(current.hit.key, { raw, score });
            }
        }
    }
    return found;
}

/* ======================================================================
 * 规整
 * ==================================================================== */

/**
 * OCR 把数字读成字母的对照表。
 *
 * **只用在数字项上**：名字与帮派里出现 O、l 是正常的，套这张表会把「Olaf」改成「014f」。
 * 只收「形状几乎不可能认错」的那几个，不做全表模糊——多改一个反而制造新错误。
 */
const DIGIT_FIX: Record<string, string> = {
    O: '0',
    o: '0',
    D: '0',
    I: '1',
    l: '1',
    '|': '1',
    S: '5',
    B: '8',
    Z: '2',
    G: '6',
    T: '7',
};

/** 全角数字与全角斜杠先换成半角，后面的规则就只用管一套字符。 */
function toHalf(text: string): string {
    return text
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/[／∕]/g, '/')
        .replace(/[，,]/g, '');
}

/** 从一格原文里取出所有数字。字母先按 `DIGIT_FIX` 归一，再只留数字段。 */
function numbersOf(raw: string): number[] {
    const fixed = toHalf(raw).replace(/[A-Za-z|]/g, (char) => DIGIT_FIX[char] ?? char);
    return [...fixed.matchAll(/\d+/g)].map((one) => Number(one[0]));
}

/** 原文里有没有「本该是数字、却被读成字母」的字。有就说明这一格要存疑。 */
function hasLetterNoise(raw: string): boolean {
    return /[A-Za-z|]/.test(toHalf(raw));
}

/** 规整一格的结果。`state` 决定这一项会不会写进卡上（见 `OcrState`）。 */
type Parsed = { value: string; state: OcrState };

/** 门派名。表在 `public/game/data/schools.json`，21 个，认不全就说明是读错了。 */
function matchSchool(raw: string, names: readonly string[]): Parsed {
    const text = tidy(raw);
    if (!text) return { value: '', state: 'miss' };

    /* 表还没加载回来（`loadGameData` 失败时是全站空表，见 `game-data.ts` 的说明）：
     * 这时**不能**把每个门派都判成「表里没有」，那会让整张卡一个字都写不进去。
     * 原样收下、标存疑，等用户自己核一眼。 */
    if (!names.length) {
        return { value: text, state: 'guess' };
    }

    const exact = names.find((name) => name === text);
    if (exact) return { value: exact, state: 'ok' };

    /* 包含关系：检测框偶尔会把门派名切掉一截（「五庄」/「五庄观」），
     * 或者把旁边的图标认成字。只认「长度 ≥ 2 且唯一命中」，两个都能对上就不猜。 */
    const partial = names.filter((name) => name.includes(text) || text.includes(name));
    if (text.length >= 2 && partial.length === 1) {
        return { value: partial[0], state: 'guess' };
    }
    return { value: text, state: 'bad' };
}

/** 一格普通的数：取第一个。 */
function firstNumber(raw: string): Parsed {
    const numbers = numbersOf(raw);
    if (!numbers.length) return { value: '', state: 'bad' };
    return {
        value: String(numbers[0]),
        state: hasLetterNoise(raw) ? 'guess' : 'ok',
    };
}

/**
 * 资源四行（气血 / 魔法 / 活力 / 体力）：取**最后一个**数。
 *
 * 面板写的是「当前/上限」（气血是「当前/上限/上限」，含临时加成），而卡上这一格
 * 记的是**上限**——老数据里 `活力 860`、`体力 900` 都是上限值。
 * 取第一个会把「现在还剩 313 体力」记成一个号的属性，明天再截一张图就变了。
 */
function capNumber(raw: string): Parsed {
    const numbers = numbersOf(raw);
    if (!numbers.length) return { value: '', state: 'bad' };
    return {
        value: String(numbers[numbers.length - 1]),
        state: hasLetterNoise(raw) ? 'guess' : 'ok',
    };
}

/** 一万。经验在游戏里是千万级的原始数。 */
const WAN = 10000;

/**
 * 经验的原始数 → 卡上记法（**万**）。
 *
 * 面板给的是 `39686092`，而卡上历来记 `3,968.6万`（`ExpRow` 是自由文本，
 * `expPercent` 只认「数字 + 万 / 亿」）。不转的话，同一个号在面板上是八位数、
 * 在卡上是「万」，每次核对都要心算除一次一万。
 *
 * 三条边界，都是为了「别把已经对的东西再转一遍」：
 *   ① 原文自己带「万 / 亿」→ **原样交出**（`firstNumber` 会把量纲丢掉只剩整数，
 *      照它再乘除就是二次换算）；
 *   ② 不是纯数字 → 原样（空、带字母的噪声值）；
 *   ③ 小于一万 → 原样（新号的 `3968` 写成 `0.4万` 反而看不清）。
 *
 * 保留一位小数并去掉末尾的 `.0`：`20000000 → 2000万`、`39686092 → 3968.6万`。
 * 一位小数是「万」这一档能读出的精度：四舍五入到 `万` 会把 3968.6 读成 3969，
 * 而这一格在卡上就是拿来比「离下一级还差多少」的。
 */
function asWan(raw: string, digits: string): string {
    if (/[万亿]/.test(raw)) return tidy(raw);
    if (!/^\d+$/.test(digits)) return digits;
    const amount = Number(digits);
    if (!Number.isFinite(amount) || amount < WAN) return digits;
    const wan = Math.round(amount / (WAN / 10)) / 10;
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`;
}

/** 等级：整数，范围按游戏给（1~200）。 */
function levelOf(raw: string): Parsed {
    const one = firstNumber(raw);
    if (one.state === 'bad') return one;
    const level = Number(one.value);
    if (!Number.isInteger(level) || level < 1 || level > 200) {
        return { value: one.value, state: 'bad' };
    }
    return one;
}

/** 低置信度统一降级成「存疑」，不直接丢：让用户自己看一眼比猜错强。 */
const LOW_SCORE = 0.6;

function withScore(field: OcrField, score: number): OcrField {
    if (score > 0 && score < LOW_SCORE && field.state === 'ok') {
        return { ...field, state: 'guess' };
    }
    return field;
}

/* ======================================================================
 * 解析
 * ==================================================================== */

/**
 * 身份四项 + 属性十八行 + 经验两项。**顺序就是认的先后**。
 *
 * 只有键、没有显示名：认出来的东西只往右边那张卡上写，卡上的行名来自 `ATTR_GROUPS`
 * （属性行）与卡头（身份四项），识别层再存一份「名称 / 等级 / 经验」纯属重复
 * ——而且那几份文案已经从老左栏撤掉一次了（2026-11-07）。
 */
const fieldOrder = (): string[] => [
    'name',
    'level',
    'school',
    'guild',
    ...ATTR_ORDER,
    'expValue',
    'expNeed',
];

/** 解析参数。 */
export interface AttrPanelOptions {
    /**
     * 门派名清单。默认取 `services/game-data` 里那张表（启动时已加载完）。
     *
     * 做成参数只有一个理由：**能测**。那张表是 `fetch` 回来的，vitest 里没有启动流程，
     * 默认值一定是空表——而空表走的是「不校验」那条退路，测不到匹配规则本身。
     */
    schools?: readonly string[];
}

/**
 * 解析一张属性面板。
 *
 * 认不到就 `miss`，认到了但不合理就 `bad`——两者都不写进卡片，见 `OcrState` 的注释。
 */
export function parseAttrPanel(
    lines: readonly OcrLine[],
    options: AttrPanelOptions = {},
): AttrPanelResult {
    const schools = options.schools ?? schoolNames();
    const found = collect(rowsOf(lines));

    /* 「经验 39686092/14142174」这种一行两个数的，拆成当前/所需两项。
     * 当前经验在左、升级所需在右，与面板底部经验条的顺序一致。
     *
     * **带量纲的不拆**：`4,281.1万` 里小数点后那个「1」也会被 `numbersOf` 当成第二个数，
     * 一拆就把 4281.1万 拆成 4281 + 1。面板目前给的是原始数，这条是防着将来改成
     * 显示「万」时静默算错——那种错在卡上看着完全正常。 */
    const exp = found.get('expValue');
    if (exp) {
        const numbers = numbersOf(exp.raw);
        if (numbers.length >= 2 && !/[万亿]/.test(exp.raw)) {
            found.set('expValue', { raw: String(numbers[0]), score: exp.score });
            found.set('expNeed', { raw: String(numbers[1]), score: exp.score });
        }
    }

    const fields = fieldOrder().map((key): OcrField => {
        const hit = found.get(key);
        const base = { key, score: hit?.score ?? 0 };
        if (!hit) {
            return { ...base, raw: '', value: '', state: 'miss' };
        }

        if (key === 'name' || key === 'guild') {
            /* 名字与帮派是自由文本，**一个字都不改**：帮派名里带数字、带生僻字都正常。 */
            return {
                ...base,
                raw: hit.raw,
                value: hit.raw,
                state: hit.raw ? 'ok' : 'miss',
            };
        }
        if (key === 'school') {
            const matched = matchSchool(hit.raw, schools);
            return { ...base, raw: hit.raw, ...matched };
        }
        if (key === 'level') {
            const parsed = levelOf(hit.raw);
            return withScore({ ...base, raw: hit.raw, ...parsed }, hit.score);
        }
        if (RESOURCE_KEYS.includes(key)) {
            const parsed = capNumber(hit.raw);
            return withScore({ ...base, raw: hit.raw, ...parsed }, hit.score);
        }
        /* 经验两项换成「万」再交出去（见 `asWan`）。`raw` 留着原样的八位数——
         * 它是证据，「为什么是这个值」要能对回面板上那一格。 */
        if (key === 'expValue' || key === 'expNeed') {
            const parsed = firstNumber(hit.raw);
            return withScore(
                { ...base, raw: hit.raw, ...parsed, value: asWan(hit.raw, parsed.value) },
                hit.score,
            );
        }
        const parsed = firstNumber(hit.raw);
        return withScore({ ...base, raw: hit.raw, ...parsed }, hit.score);
    });

    const hit = fields.filter((field) => field.state === 'ok' || field.state === 'guess').length;
    return { fields, hit, total: fields.length };
}

/* ======================================================================
 * 落到卡片上
 * ==================================================================== */

/**
 * 把识别结果合进一张角色卡。
 *
 * 三条规矩：
 *   ① **只写 `ok` / `guess`**，而且要非空——没认到的项一个字都不动；
 *   ② 门派变了要跟着换门派技能（与编辑弹窗同一条规则，见 `schoolSkills`），
 *      否则卡上会出现「门派是五庄观、技能还是化生寺的七项」；
 *   ③ 潜能（乾元丹 / 潜能果）**不在这张面板上**，这里也不碰。
 */
export function applyAttrPanel(base: CharacterData, fields: readonly OcrField[]): CharacterData {
    const next = normalizeCharacter(base);
    const valueOf = (key: string): string => {
        const field = fields.find((one) => one.key === key);
        if (!field) return '';
        if (field.state !== 'ok' && field.state !== 'guess') return '';
        return field.value.trim();
    };

    const name = valueOf('name');
    if (name) next.name = name;

    const guild = valueOf('guild');
    if (guild) next.guild = guild;

    const level = Number(valueOf('level'));
    if (Number.isInteger(level) && level > 0) next.level = level;

    const school = valueOf('school');
    if (school && school !== next.school) {
        next.school = school;
        next.skills = schoolSkills(school, next.skills);
    }

    /* 属性行按标签写回。`normalizeCharacter` 已经按 `ATTR_GROUPS` 重建过五组，
     * 所以这里只可能是「已知的行」，不会写进去一个清单外的标签。 */
    next.attrGroups = next.attrGroups.map((group: AttrGroup) => ({
        ...group,
        rows: group.rows.map((row) => {
            const value = valueOf(row.label);
            return value ? { ...row, value } : row;
        }),
    }));

    const expValue = valueOf('expValue');
    const expNeed = valueOf('expNeed');
    next.experience = {
        value: expValue || next.experience.value,
        need: expNeed || next.experience.need,
    };

    return next;
}
