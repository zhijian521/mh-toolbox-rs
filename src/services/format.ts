/**
 * 金额与日期的**呈现**：这一份全站共用。
 *
 * ---- 为什么在这里，而不是留在某一页 ----
 * 这些函数原先散在 `views/prices/prices.ts` 与 `views/income/income.ts` 两处：
 * 收益页要从物价页引 `moneyText` / `todayText`，设置页的数据区也要引物价页的常量
 * （`DataSection.vue` 自己的注释写着「设置页反过来引一个页面模块看着别扭」）。
 * 一个页面模块被另一个页面模块依赖，说明它承担的其实不是「物价」，是「记账口径」。
 *
 * 所以挪到 `services/`：它不碰 IO、不碰 Vue、也不知道价格与收益的区别，
 * 只回答「这个数怎么写给人看」「这一天怎么写」。页面可以互相不引用。
 *
 * ---- 两条口径，写在这里一次，全站不许各写一份 ----
 * ① **金额存原值（币），显示时才折万。** 存「4.6」再配一个单位列，每处读取都要记得乘回去，
 *    漏乘一次的表现是「账目少了一万倍」——不报错，只是总数悄悄不对。
 * ② **日期取本地分量自己拼 `YYYY-MM-DD`，不用 `toISOString()`。** 后者是 UTC，
 *    东八区凌晨 0–8 点会给出昨天，只有熬夜的人碰得上，报上来时根本复现不了。
 */

/** 一万。速记的输入框收「万」（打 `4.6`），落库是「原值」（`46000`）。 */
export const WAN = 10_000;

/** 万 → 原值。**必须取整**：`4.6 * 10000` 在浮点里是 46000.00000000001。 */
export function fromWan(wan: number): number {
    return Math.round(wan * WAN);
}

/** 原值 → 万（不取整：界面上要显示 4.6，取整会变成 5）。 */
export function toWan(amount: number): number {
    return amount / WAN;
}

/**
 * 把一个 `Date` 写成 `YYYY-MM-DD`（本地分量，不碰 UTC）。
 *
 * 这是全站**唯一**的「日期怎么落成字符串」，`todayText` 与 `daysAgo` 都走它。
 * 收 `Date` 也收毫秒（记录里的 `startAt` / `createdAt` 是 number）——不然每处调用都要先
 * `new Date(…)` 一遍，补零与本地分量就又有了第二份写法。
 * 2026-11-05 抽出来，是因为收益页要算「本月 / 上月同期」两个窗口：那需要先构造
 * `Date`（跨月由 `setMonth` / `new Date(y, m, 0)` 承担）再落成文本，而落文本的
 * 那一行不能再抄一遍——口径②（本地分量、不用 `toISOString()`）抄第二遍就会漂。
 */
export function dateText(at: Date | number): string {
    const one = typeof at === 'number' ? new Date(at) : at;
    const month = `${one.getMonth() + 1}`.padStart(2, '0');
    const day = `${one.getDate()}`.padStart(2, '0');
    return `${one.getFullYear()}-${month}-${day}`;
}

/**
 * `YYYY-MM-DD` 反过来读成 `Date`（本地零点）。
 *
 * 与 `dateText` 是一对：那边把日期写出去，这边读回来。**三处各写过一份**（日期选择器、
 * 账号页的档位区间、总览的近七天），逐字相同——2026-11-05 收到这里。抄三份的风险不是
 * 体积，而是有人只改了其中一处（比如给月、日补默认值时忘了另一处），于是同一个字符串在
 * 两页里算出的日期差一天。
 *
 * 缺月/日时按 `1` 兜底，不返回 `NaN`：`new Date(2026, NaN, ...)` 会让整条时间轴静默变成
 * 空白，而「某个月的 1 号」至少还能画出来。调用方要判「日期是否合法」应该在归一那一层做。
 */
export function parseDay(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

/** 今天，`YYYY-MM-DD`。**不能用 `toISOString().slice(0, 10)`**（理由见文件头口径②）。 */
export function todayText(): string {
    return dateText(new Date());
}

/** 日期去掉年份：卡片与历史列表里全是今年的记录，年份占位置不提供信息。 */
export function shortDate(date: string): string {
    return date.length === 10 ? date.slice(5) : date;
}

/**
 * 往前推 `offset` 天的日期文本（`offset = 0` 就是今天）。
 *
 * **走本地时区、手动拼**，与 `todayText` 同一条口径。`offset` 为负（往后推）也成立
 * ——`setDate` 自己会进位，跨月、跨年、夏令时都由它承担。
 */
export function daysAgo(offset: number, from: Date = new Date()): string {
    const at = new Date(from.getTime());
    at.setDate(at.getDate() - offset);
    return dateText(at);
}

/**
 * 历史列表里那一天的写法：`今天` / `昨天` / `11月2日` / `2025年12月30日`。
 *
 * 近两天用人话，再往前给月日——「11月2日」比「2026-11-02」快读一档，而年份在
 * 一本只记了几个月的新账里是纯噪声（真跨年了才补，不然「12月30日」会让人以为是今年的）。
 *
 * `now` 可以注入：这个函数要能单测，而直接取 `todayText()` 的测试会在跨午夜时随机失败。
 * 「昨天」走 `daysAgo`，不自己减毫秒——跨月、跨年、夏令时都由它承担，那是它已经测过的部分。
 */
export function dayText(date: string, now: string = todayText()): string {
    if (date === now) return '今天';
    if (date === daysAgo(1, new Date(`${now}T00:00:00`))) return '昨天';

    const [year, month, day] = date.split('-');
    const label = `${Number(month)}月${Number(day)}日`;
    return year === now.slice(0, 4) ? label : `${year}年${label}`;
}

/**
 * 折万后的数字串，去掉多余的零。
 *
 * 四位不是随手取的：`PriceField` 的输入精度就是「万的小数点后四位」
 * （`Math.round(万 × 10000)`，正好 1 币）。显示只留两位的话，输入 1.2345 万存进去的
 * 12345 币会显示成「1.23 万」，再打开编辑又变回 1.2345——用户会以为没存对。
 * 两处同一个精度，同一件事才不会出现两种说法。
 *
 * 绝大多数价格是整万或一位小数，四位只在真的打到个位数时才出现，不会普遍变长。
 */
function trimZero(value: number): string {
    const fixed = value.toFixed(4).replace(/\.?0+$/, '');
    return fixed === '' ? '0' : fixed;
}

export interface PriceLabel {
    value: string;
    unit: string;
}

/**
 * 价格显示口径：**一律以「万」为单位**，不足一万的按原值。
 *
 * 梦幻币的量级就是几十万到几亿，摆摊也这么说（「这个 320 万」）。
 * 原先满亿会折成「1.5 亿」——于是同一列里「1.5 亿」和「860 万」两种单位并排，
 * 读的人得在心里换算一次才能比大小。全都落成万之后，一列数字可以直接比。
 *
 * 代价是上亿的数会变长（1.5 亿 → 15000 万）。这是用户明确要的：物价页看的是行情对比，
 * 不是报数，同一个单位比「短」更重要。
 *
 * 不足一万仍按原值：`0.03 万` 比 `333` 更难懂，而梦幻币低于一万的价本来就少。
 * 这与输入侧不冲突：`PriceField` 收「万」（打 0.8），存的是原值 8000，显示回「8000」——
 * 输入按万是为了少打零，显示按原值是为了好读，两个方向各取所长。
 *
 * 卡片、历史、走势图纵轴共用这一个函数——三处各写一套换算，迟早有一处把 1.5 亿写成
 * 1500 万。
 *
 * 传 `null` 或 0 时给「—」且单位为空：那是「未记录」，不是「零游戏币」。
 */
export function priceLabel(value: number | null): PriceLabel {
    const total = Number(value);
    if (!Number.isFinite(total) || total <= 0) return { value: '—', unit: '' };
    if (total >= 10000) return { value: trimZero(total / 10000), unit: '万' };
    return { value: trimZero(total), unit: '' };
}

/** 金额一句话（带单位）。不到一万时单位为空，直接拼会留一个尾随空格。 */
export function moneyText(value: number): string {
    const label = priceLabel(Math.abs(value));
    return label.unit ? `${label.value} ${label.unit}` : label.value;
}

/**
 * 带正负号的差额：「+1.5 万」「−80」「持平」。
 *
 * 减号用 U+2212（`−`）而不是 ASCII 连字符：与 `+` 等宽，一列差额上下对齐时不会左右晃。
 * 全站数字列都走 `tabular-nums`，就这一处会破功。
 */
export function changeText(delta: number): string {
    if (delta === 0) return '持平';
    const sign = delta > 0 ? '+' : '−';
    return sign + moneyText(delta);
}

/** 账号、收益统一按元或万展示，最多两位小数；原值精度不变。 */
export function ledgerMoneyText(
    amount: number,
    currency: 'rmb' | 'cash' = 'cash',
    options: { sign?: 'auto' | 'always'; zero?: 'dash' } = {},
): string {
    const value = Math.abs(amount) / (currency === 'cash' ? WAN : 1);
    if (!Number.isFinite(value)) return '—';
    if (amount === 0 && options.zero === 'dash') return '—';
    const visible = Math.round(value * 100) > 0;
    const sign =
        !options.sign || !visible ? '' : amount < 0 ? '−' : options.sign === 'always' ? '+' : '';
    return (
        sign +
        value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) +
        (currency === 'cash' ? ' 万' : ' 元')
    );
}
