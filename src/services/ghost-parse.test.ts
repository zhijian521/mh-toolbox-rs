import { describe, expect, it } from 'vitest';
import mapsFile from '../../public/maps/maps.json';
import type { OcrLine } from './ghost';
import type { GhostMap } from './ghost-maps';
import { parseGhostTasks, type ParsedTask } from './ghost-parse';

/**
 * 解析规则的回归测试。
 *
 * 这一层的全部价值是「可以喂假文本反复试」——不把它真的喂起来，那句设计意图
 * 就只是注释。用例分两组：
 *
 * 1. **真机 8 帧**：2026-11-01 用户从页面「识别原文」抄回来的原样输出。
 *    它们是唯一的证据档案，说明「正则为什么要写得这么松」——理想文本永远
 *    测不出「句首整段走样」「括号被读成书名号」这些错法。
 * 2. **单条规则**：每条容错为什么存在、边界在哪，一条对一个。
 *
 * 底图清单读**真实的** `public/maps/maps.json`，不用手搓的假 map：地名匹配
 * 依赖清单里的名字与值域，假数据会让「碗子山能不能认出来」这种问题测成空转。
 * 用 `import` 而不是 `node:fs`：渲染层没装 `@types/node`，也不该为了测试把它装上。
 */
const maps: GhostMap[] = mapsFile.maps;

/** 按行序生成 y。间距不重要，只要求递增；`parseGhostTasks` 自己会按 y 排序。 */
function rows(...texts: string[]): OcrLine[] {
    return texts.map((text, index) => ({
        text,
        x: 0,
        y: 2 + index * 14,
        width: 260,
        height: 13,
        score: 1,
    }));
}

/** 一条任务画成「地图 坐标」，没解析出来就是 `null`，便于在表里一眼比对。 */
function label(task: ParsedTask | undefined): string | null {
    if (!task) return null;
    return `${task.map?.name ?? `（无底图）${task.mapText}`} ${task.x},${task.y}`;
}

function pick(lines: OcrLine[]) {
    const report = parseGhostTasks(lines, maps);
    return {
        small: label(report.tasks.find((task) => task.kind === 'small')),
        big: label(report.tasks.find((task) => task.kind === 'big')),
        issues: report.issues,
        corrections: report.corrections,
    };
}

/**
 * 8 帧真机原文，**逐字照抄**，包括字与字之间的空格——OCR 把每个字的间隙也
 * 当成了字符边界，删空格那步（`normalize`）被测到才算数。
 *
 * 数据源头是 `tools/probe/fixtures/ghost-ipc.js` 的 `liveFrames`。两处都留，
 * 是因为用途不同：那边验的是「界面上的时序与绘制」，这边验的是「解析结果对不对」。
 * 这是**冻结的历史样本**，不会随代码演进而改；真要补新样本，两处一起加。
 *
 * 帧 7 的大鬼**故意留在失败状态**：`36，，45` 是把 `36，145` 的「1」读成了逗号，
 * 放行就会得到一个看起来合法、实际差 100 格的坐标。宁可这一帧不更新，
 * 交给「保留最佳」顶着上一帧的正确值。
 */
const LIVE_FRAMES: { name: string; lines: OcrLine[]; small: string | null; big: string | null }[] =
    [
        {
            name: '帧 1：标准读法，剩余时长那行有 00',
            lines: rows(
                '0@@',
                '0 任 务 追 踪 ？ >',
                '捉 鬼',
                '钟 馗 抓 鬼 （ 第 1 个 ） ： 去',
                '建 邺 城 204 ， 107 附 近 抓 辰',
                '时 二 刻 有 穷 鬼 。',
                '鬼 王',
                '降 服 千 年 厉 鬼 （ 第 1 个 ）',
                '去 腕 孑 山 的 36 ， 145 附',
                '近 降 服 时 一 刻 摄 亩 鬼',
                '王 · 剩 余 00 ） 分 钟',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 2：大鬼行首多一条竖线，被纠错成 1',
            lines: rows(
                '0 任 务 追 踪 ？ ，',
                '捉 鬼',
                '钟 馗 抓 鬼 （ 第 1 个 ） ： 去',
                '建 邺 城 204 ， 107 附 近 抓 辰',
                '时 二 刻 有 穷 鬼 。',
                '鬼 王',
                '降 服 千 年 厉 鬼 （ 第 1 个 ）',
                '去 腕 孑 山 的 36 ， 145 附',
                '| 近 降 服 寅 时 一 刻 摄 鬼',
                '1 王 ， 剩 余 （ 10 ） 分 钟',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 3：分隔符后夹一个「一」（36，一145）',
            lines: rows(
                '0 任 务 追 踪 ？ >',
                '捉 鬼',
                '钟 馗 抓 鬼 （ 第 1 个 ） ： 去',
                '建 邺 城 204 ， 107 附 近 抓 辰',
                '时 二 刻 有 穷 鬼 。',
                '鬼 王',
                '降 服 千 年 厉 鬼 （ 第 1 个 ）',
                '去 碗 孑 山 的 36 ， 一 145 附',
                '近 降 服 寅 时 一 刻 摄 鬼',
                '王 · 剩 余 （ 9 ） 分 钟',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 4：右括号变成书名号，地名前多一个引号',
            lines: rows(
                "钟 馗 抓 鬼 （ 第 1 个 ） 《 去 '",
                '建 邺 城 204 ， 107 附 近 抓 辰',
                '时 二 刻 有 穷 鬼 。',
                '丶 鬼 王',
                '降 服 千 年 厉 鬼 （ 第 1 个 ）',
                '去 腕 孑 山 的 36 ， 145 附',
                '近 降 服 寅 时 一 刻 摄 鬼',
                '一 王 ， 剩 余 （ 8 汾 钟',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 5：两条任务都完整，坐标仍是「一145」',
            lines: rows(
                '跷 0',
                '0 任 务 追 踪 ？ >',
                '捉 鬼',
                '钟 馗 抓 鬼 （ 第 1 个 ） ： 去',
                '建 邺 城 204 ， 107 附 近 抓 辰',
                '时 二 刻 有 穷 鬼 。',
                '鬼 王',
                '降 服 千 年 厉 鬼 （ 第 1 个 ）',
                '去 碗 孑 山 的 36 ， 一 145 附',
                '近 降 服 寅 时 一 刻 摄 鬼',
                '王 · 剩 余 （ 8 ） 分 钟',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 6：句首「钟」被读成「霉」，「降」整字消失',
            lines: rows(
                '0 任 务 追 踪 ？ >',
                '弓',
                '霉 馗 抓 鬼 〈 第 1 个',
                '去 建 邺 城 204 ，',
                '107 附 近 抓 辰 时 二',
                '刻 有 穷 鬼 。',
                '服 千 年 厉 鬼 （ 第',
                '、 1 个 ） ： 去 腕 孑 山',
                '的 36 ， 145 附 近 降',
                '8 宝 口 計 一 南 由',
                '女 瘟 鬼',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
        {
            name: '帧 7：句子彻底崩坏，「去」被读成「昊」，大鬼坐标不可救',
            lines: rows(
                '0 0 任 务 追 踪 ？ >',
                '中 旭 抓 鬼 （ 第 1 个 ） ．',
                '昊 建 邺 城 204 ， 107 附',
                '抓 辰 时 二 刻 有 穷 鬼',
                '王',
                '挚 月 艮 千 厉 鬼 （ 第 1 个',
                '： 去 子 山 的 36 ， ，',
                '45 附 近 降 服 寅 时 一',
                '摄 毒 鬼 王 ， 剩 余 固',
            ),
            small: '建邺城 204,107',
            big: null,
        },
        {
            name: '帧 8：两条都在，句首少了「钟」与「降」',
            lines: rows(
                '馗 抓 鬼 （ 第 1 个',
                '） ： 去 建 邺 城 204 ，',
                '107 附 近 抓 辰 时 二',
                '刻 有 穷 鬼 。',
                '服 千 年 厉 鬼 （ 第',
                '1 个 ） ： 去 碗 孑 山',
                '的 36 ， 145 附 近 降',
                '8 宝 Ä 計 一 切 性 南',
            ),
            small: '建邺城 204,107',
            big: '碗子山 36,145',
        },
    ];

describe('parseGhostTasks：真机 8 帧', () => {
    for (const frame of LIVE_FRAMES) {
        it(frame.name, () => {
            const { small, big } = pick(frame.lines);
            expect(small).toBe(frame.small);
            expect(big).toBe(frame.big);
        });
    }

    it('帧 7 的大鬼判失败要留一句原因，不能悄悄消失', () => {
        const frame = LIVE_FRAMES.find((item) => item.big === null);
        expect(frame).toBeDefined();
        const { issues } = pick(frame!.lines);
        expect(issues.some((issue) => issue.includes('降服'))).toBe(true);
    });
});

describe('parseGhostTasks：单条容错', () => {
    it('地名只读到两个字也能落到正确的底图（建邺 → 建邺城）', () => {
        const { small } = pick(rows('钟馗抓鬼（第1个）：去建邺204,107附近抓辰时二刻'));
        expect(small).toBe('建邺城 204,107');
    });

    it('形近字归一（碗孑山 → 碗子山）', () => {
        const { big } = pick(rows('降服千年厉鬼（第1个）去腕孑山的60，141附近'));
        expect(big).toBe('碗子山 60,141');
    });

    it('字母被读成数字时纠错，并留下记录给界面显示', () => {
        const { small, corrections } = pick(rows('钟馗抓鬼（第1个）：去江南野外134,5q附近'));
        expect(small).toBe('江南野外 134,59');
        expect(corrections).toEqual([{ from: 'q', to: '9' }]);
    });

    it('分隔符后紧跟分隔符一律判失败，不硬凑一个「合法」坐标', () => {
        // `36，，45` 是 `36，145` 把「1」读成了逗号。放行会得到 36,45——
        // 差 100 格，没有任何外部约束拦得住，图上却是另一个位置。
        const { big, issues } = pick(rows('降服千年厉鬼（第1个）去碗子山的36，，45附近'));
        expect(big).toBeNull();
        expect(issues.some((issue) => issue.includes('降服'))).toBe(true);
    });

    it('假坐标超出该图值域时照样保留，只留一句说明', () => {
        // 用户实测：普陀山 96×72 读到 100,66。任务栏给的是假坐标，游戏按真实位置
        // ±50 随机、**不按地图边界裁剪**，真身贴着右边时提示坐标本身就会越界。
        // 早先按「OCR 认错一位」丢弃，等于把一条本来能用的任务判成没读到。
        const { small, issues } = pick(rows('钟馗抓鬼（第1个）：去普陀山100,66附近抓辰时二刻'));
        expect(small).toBe('普陀山 100,66');
        expect(issues.some((issue) => issue.includes('超出该图值域'))).toBe(true);
        expect(issues.some((issue) => issue.includes('已丢弃'))).toBe(false);
    });

    it('越界再多也只是「按贴边画」，任务照样保留', () => {
        // 600 对碗子山 95 格几乎肯定是认错了。但判错是用户的事——框贴着右边缘、
        // 说明里写着越界，信不信由他；任务直接消失则连判断的机会都没有。
        const { big, issues } = pick(rows('降服千年厉鬼（第1个）去碗子山的600，45附近'));
        expect(big).toBe('碗子山 600,45');
        expect(issues.some((issue) => issue.includes('按贴边画'))).toBe(true);
    });

    it('地名完全对不上底图时仍给出任务，只是没有图（交给界面显示原因）', () => {
        const { small, issues } = pick(rows('钟馗抓鬼（第1个）：去不存在的地方12,34附近'));
        expect(small).toBe('（无底图）不存在的地方 12,34');
        expect(issues.some((issue) => issue.includes('没有对应的底图'))).toBe(true);
    });
});

/** 取某条任务的天眼状态。 */
function revealOf(lines: OcrLine[], kind: 'small' | 'big') {
    return parseGhostTasks(lines, maps).tasks.find((task) => task.kind === kind)?.reveal;
}

/**
 * 天眼状态的四档。
 *
 * 这一层最容易在后续「顺手简化」时被压成两档（有句尾 / 没句尾），而压掉的正好是
 * `silent` 与 `unknown` 的区别——一个画点、一个画范围，混淆的后果是**整类任务**
 * 都画错，不是个别帧。
 */
describe('parseGhostTasks：天眼状态', () => {
    it('读到「附近」→ nearby（未开眼）', () => {
        const lines = rows('钟馗抓鬼（第1个）：去江南野外134,54附近抓巳时四刻偷尸鬼。');
        expect(revealOf(lines, 'small')).toBe('nearby');
    });

    it('读到「处」→ exact（开天眼）', () => {
        const lines = rows('钟馗抓鬼（第1个）：去江南野外134,54处抓巳时四刻偷尸鬼。');
        expect(revealOf(lines, 'small')).toBe('exact');
    });

    it('「附近」被整段删掉 → silent（另一种开天眼写法）', () => {
        // 游戏开天眼不给替代字，只是把「附近」两个字删掉，句子缩成
        // `去江南野外134,54抓…`。句尾这时是**空**的，但语义与「处」相同。
        const lines = rows('钟馗抓鬼（第1个）：去江南野外134,54抓巳时四刻偷尸鬼。');
        expect(revealOf(lines, 'small')).toBe('silent');
    });

    it('走兜底句式时是 unknown，不能当成「没有附近」', () => {
        // 句首整段走样、只能靠「抓鬼…去…坐标」兜底，这一层压根不捕获句尾。
        // 若把它也判成 silent，每一条兜底解析的任务都会变成一个精确点。
        const lines = rows('中旭抓鬼昊建邺城204,107抓辰时二刻');
        expect(revealOf(lines, 'small')).toBe('unknown');
    });
});

/**
 * 逗号丢在折行处。
 *
 * 任务栏折行**正好落在逗号上**时，逗号落在行尾被裁掉，两段数字拼起来粘成一串。
 * 这一组的每一帧都来自 2026-11-01 用户实测的原文，按他给的行切开——行怎么分
 * 其实不影响结果（`normalize` 会删光空白），但留着才是原始证据。
 *
 * 判分点的取舍：切不开时**不猜**。错几十格的坐标比没有坐标更坏——用户会照着
 * 走过去，而界面上一切正常。
 */
describe('parseGhostTasks：逗号丢在折行处', () => {
    it('用户实测帧：麒麟山 119107 → 119,107（六位串只有 3+3 能让两轴都不爆值域）', () => {
        const { big, issues } = pick(
            rows(
                '任务追踪',
                'L',
                '鬼王',
                '降服千年厉鬼（第8个',
                '去麒麟山的119',
                '107附近降服子时',
                '三刻摄毒鬼王，剩余（',
                '35）分钟',
            ),
        );
        expect(big).toBe('麒麟山 119,107');
        // 切分这件事要明说：它是算出来的，不是读出来的，用户有权怀疑。
        expect(issues.some((issue) => issue.includes('缺分隔符'))).toBe(true);
        expect(revealOf(rows('降服千年厉鬼（第8个去麒麟山的119107附近降服'), 'big')).toBe('nearby');
    });

    it('五位串取「多的一位归 x」：13454 在江南野外读成 134,54', () => {
        // 1+4 / 2+4 的尾巴都爆 maxY(120)，4+1 的头爆 maxX(160)，只剩 3+2。
        const { small } = pick(rows('钟馗抓鬼（第1个）：去江南野外的13454附近'));
        expect(small).toBe('江南野外 134,54');
    });

    it('四位串取两段等长：1234 在五庄观读成 12,34', () => {
        // 五庄观 100×75。1+3 的 234 爆 maxY，3+1 的 123 爆 maxX，2+2 独活。
        const { small } = pick(rows('钟馗抓鬼（第1个）：去五庄观的1234附近'));
        expect(small).toBe('五庄观 12,34');
    });

    it('两种切法都合法时判失败，不靠猜', () => {
        // 大唐境外 640×120，`12115` 既可以切成 12,115 也可以 121,15，两段都是
        // 正数开头、都落在值域内、长度差都是 1。没有第三条信息能分辨，只能放弃。
        const { big, issues } = pick(rows('降服千年厉鬼（第1个）去大唐境外的12115附近'));
        expect(big).toBeNull();
        expect(issues.some((issue) => issue.includes('切不出唯一解'))).toBe(true);
    });

    it('前导零直接排除切法：`12105` 只可能是 12,105', () => {
        // 若坐标是 121,5，逗号丢了粘起来是 `1215`（4 位），不可能是 5 位——
        // 多出来的那个 `0` 只能属于前一段。这条约束比「等长」硬得多。
        const { big } = pick(rows('降服千年厉鬼（第1个）去大唐境外的12105附近'));
        expect(big).toBe('大唐境外 12,105');
    });

    it('地名没对上底图时不切——没有值域就没有判据', () => {
        // 只剩「两段等长」这一条猜测，而它恰恰最容易被推翻。
        const { small } = pick(rows('钟馗抓鬼（第1个）：去不存在的地方1234附近'));
        expect(small).toBeNull();
    });

    it('缺逗号的残帧不判天眼：读不到句尾一律 unknown', () => {
        // 若这一层也按「没有附近 = 开了天眼」处理，一次折行丢逗号就会把范围
        // 画成一个点——而缺逗号恰恰说明这一帧不完整。
        const lines = rows('降服千年厉鬼（第8个去麒麟山的119107降服子时');
        expect(revealOf(lines, 'big')).toBe('unknown');
    });

    it('逗号还在的帧不受影响（回归保护）', () => {
        // 第三层只在上面两层都没命中时才跑，正常帧连碰都不该碰到。
        const { small, issues } = pick(rows('钟馗抓鬼（第1个）：去江南野外134,54附近抓巳时'));
        expect(small).toBe('江南野外 134,54');
        expect(issues.some((issue) => issue.includes('缺分隔符'))).toBe(false);
    });
});
