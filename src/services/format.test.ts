import { describe, expect, it } from 'vitest';
import {
    WAN,
    isDayText,
    changeText,
    dateText,
    dayText,
    daysAgo,
    fromWan,
    ledgerMoneyText,
    moneyText,
    parseDay,
    priceLabel,
    toWan,
} from './format';

/**
 * `services/format.ts` 的**口径**：金额怎么折万、日期怎么写。
 *
 * 这些用例原先分居在 `prices.test.ts`（显示口径）与 `income.test.ts`（换算、日期），
 * 两边各测一遍同一件事、各解释一遍为什么不用 `toISOString()`。函数收拢到一处之后，
 * 用例也跟着过来——测的是「全站共用的一套写法」，不属于某一页。
 */

describe('金额换算：万与原值', () => {
    it('万转原值要取整，否则浮点尾巴会一路带进库', () => {
        /* `4.6 * 10000` 在浮点里是 46000.00000000001。不取整的话，这条记录存进库、
         * 再读出来显示成「4.6 万」看着没差，但那一天的总和在十几条之后就会多出
         * 一串小尾数。 */
        expect(fromWan(4.6)).toBe(46000);
        expect(fromWan(4.6)).toBe(Math.round(4.6 * WAN));
        expect(Number.isInteger(fromWan(12.9))).toBe(true);
        expect(fromWan(0.06)).toBe(600);
    });

    it('原值转万不取整：4.6 万不能被显示成 5 万', () => {
        expect(toWan(46000)).toBe(4.6);
        expect(toWan(41200000)).toBe(4120);
    });
});

describe('价格显示口径（只折万，不再折亿）', () => {
    it('满一万折成万；满一亿也还是万，不再出现「1.5 亿」', () => {
        expect(priceLabel(3200000)).toEqual({ value: '320', unit: '万' });
        /* 这一季改动的核心：1.5 亿 现在写成 15000 万。同一列里只剩一种单位，
         * 读的人才不用在心里换算一次再比大小。 */
        expect(priceLabel(150000000)).toEqual({ value: '15000', unit: '万' });
        expect(priceLabel(10000)).toEqual({ value: '1', unit: '万' });
    });

    it('不足一万按原值，且不带单位', () => {
        expect(priceLabel(9999)).toEqual({ value: '9999', unit: '' });
        expect(priceLabel(1)).toEqual({ value: '1', unit: '' });
        expect(priceLabel(8600)).toEqual({ value: '8600', unit: '' });
    });

    it('保留四位小数：与输入格的精度对齐，重开编辑不会「变了个数」', () => {
        expect(priceLabel(12345)).toEqual({ value: '1.2345', unit: '万' });
        expect(priceLabel(86000)).toEqual({ value: '8.6', unit: '万' });
    });

    it('尾随的零去掉，但不吃掉整数位上的零', () => {
        expect(priceLabel(15000)).toEqual({ value: '1.5', unit: '万' });
        // 1000 万 不能因为「去尾零」变成 1 万。
        expect(priceLabel(10000000)).toEqual({ value: '1000', unit: '万' });
        expect(priceLabel(10000)).toEqual({ value: '1', unit: '万' });
    });

    it('0 / null / NaN / 负数 / Infinity 都是「未记录」，不是「零游戏币」', () => {
        const dash = { value: '—', unit: '' };
        expect(priceLabel(0)).toEqual(dash);
        expect(priceLabel(null)).toEqual(dash);
        expect(priceLabel(Number.NaN)).toEqual(dash);
        expect(priceLabel(-1)).toEqual(dash);
        expect(priceLabel(Number.POSITIVE_INFINITY)).toEqual(dash);
    });

    it('moneyText 拼单位，且不留尾随空格', () => {
        expect(moneyText(3200000)).toBe('320 万');
        expect(moneyText(150000000)).toBe('15000 万');
        // 不到一万时单位为空，直接 `${value} ${unit}` 会留下一个空格。
        expect(moneyText(800)).toBe('800');
        // 差额是负数进来的（`changeText` 走这条），符号由调用方加，这里取绝对值。
        expect(moneyText(-800)).toBe('800');
    });

    it('changeText：零是「持平」，负号用 U+2212 而不是 ASCII 连字符', () => {
        expect(changeText(0)).toBe('持平');
        expect(changeText(15000)).toBe('+1.5 万');
        // U+2212 与「+」等宽，一列差额上下才对得齐（见 changeText 的注释）。
        expect(changeText(-800)).toBe('\u2212800');
        expect(changeText(-800).includes('-')).toBe(false);
    });
});

describe('日期：往前推天数', () => {
    /* 「近七天」靠这个函数划边界，而它错一天的表现是**账上少一天**——不报错、
     * 不白屏，只是那个数比记忆里小。跨月与跨年是最容易写错的两种，各来一条。 */
    it('同月内往前推，含跨月', () => {
        expect(daysAgo(0, new Date(2026, 10, 4))).toBe('2026-11-04');
        expect(daysAgo(6, new Date(2026, 10, 4))).toBe('2026-10-29');
    });

    it('跨年也成立（不是减月份）', () => {
        expect(daysAgo(3, new Date(2026, 0, 2))).toBe('2025-12-30');
    });

    it('补零到两位，否则字符串比较会把「2026-11-4」排错', () => {
        /* 按字符串比大小是筛选的全部依据（`one.date <= now`）。
         * `2026-11-4` 与 `2026-11-04` 不是同一个串，混进来会漏掉一天。 */
        expect(daysAgo(3, new Date(2026, 10, 4))).toBe('2026-11-01');
        expect(daysAgo(0, new Date(2026, 8, 9))).toBe('2026-09-09');
    });
});

describe('dayText：历史列表里的那一天怎么写', () => {
    /* `now` 注入而不是取 `todayText()`：真取的话这些用例会在
     * 跨午夜的那一秒随机失败，而那时最容易被当成「代码坏了」。 */
    const now = '2026-11-04';

    it('今天与昨天说人话', () => {
        expect(dayText(now, now)).toBe('今天');
        expect(dayText('2026-11-03', now)).toBe('昨天');
    });

    it('跨月也认得出「昨天」：不能靠「日期减一」在字符串上凑', () => {
        expect(dayText('2026-10-31', '2026-11-01')).toBe('昨天');
    });

    it('更早给月日去掉前导零，跨年才补年份', () => {
        expect(dayText('2026-11-02', now)).toBe('11月2日');
        expect(dayText('2025-12-30', now)).toBe('2025年12月30日');
    });
});

describe('parseDay：日期文本读回 Date', () => {
    /* 这条函数原先在三个地方各写一份（日期选择器、账号页的档位区间、总览的近七天），
     * 逐字相同。收进 `format.ts` 之后至少要钉住两件事：它读的是**本地零点**，
     * 以及缺月/日时不产出 `NaN`（那会让整条时间轴静默变空）。 */
    it('按本地分量读，不碰 UTC', () => {
        const at = parseDay('2026-11-05');
        expect(at.getFullYear()).toBe(2026);
        expect(at.getMonth()).toBe(10);
        expect(at.getDate()).toBe(5);
        expect(at.getHours()).toBe(0);
    });

    it('与 dateText 往返一致', () => {
        expect(dateText(parseDay('2026-03-01'))).toBe('2026-03-01');
        expect(dateText(parseDay('2026-12-31'))).toBe('2026-12-31');
    });

    it('缺月/日兜底成 1 号，不产出 Invalid Date', () => {
        expect(dateText(parseDay('2026'))).toBe('2026-01-01');
        expect(Number.isNaN(parseDay('2026').getTime())).toBe(false);
    });
});

describe('账号与收益金额：元、万与两位小数', () => {
    it('显式控制方向与空读数，不拼负零和双重符号', () => {
        expect(ledgerMoneyText(30000, 'cash', { sign: 'always' })).toBe('+3 万');
        expect(ledgerMoneyText(-30000, 'cash', { sign: 'auto' })).toBe('−3 万');
        expect(ledgerMoneyText(-0.001, 'rmb', { sign: 'always' })).toBe('0 元');
        expect(ledgerMoneyText(0, 'cash', { sign: 'always' })).toBe('0 万');
        expect(ledgerMoneyText(0, 'cash', { zero: 'dash' })).toBe('—');
        expect(ledgerMoneyText(NaN, 'cash', { sign: 'always' })).toBe('—');
    });
    it('人民币按元显示，去尾零并保留千分位', () => {
        expect(ledgerMoneyText(1234.567, 'rmb')).toBe('1,234.57 元');
        expect(ledgerMoneyText(30, 'rmb')).toBe('30 元');
        expect(ledgerMoneyText(0.1 + 0.2, 'rmb')).toBe('0.3 元');
    });

    it('梦幻币始终按万显示，不足一万与满亿也不换单位', () => {
        expect(ledgerMoneyText(8000)).toBe('0.8 万');
        expect(ledgerMoneyText(12345)).toBe('1.23 万');
        expect(ledgerMoneyText(12399)).toBe('1.24 万');
        expect(ledgerMoneyText(100000000)).toBe('10,000 万');
        expect(ledgerMoneyText(-12399)).toBe('1.24 万');
    });

    it('零与非有限数不产生非法读数', () => {
        expect(ledgerMoneyText(0)).toBe('0 万');
        expect(ledgerMoneyText(0, 'rmb')).toBe('0 元');
        expect(ledgerMoneyText(NaN)).toBe('—');
        expect(ledgerMoneyText(Infinity, 'rmb')).toBe('—');
    });
});

describe('真实日期校验', () => {
    it.each(['2024-02-29', '2000-02-29', '2026-11-14', '0099-01-01'])(
        '接受合法日期 %s',
        (value) => {
            expect(isDayText(value)).toBe(true);
        },
    );
    it.each([
        '2026-02-29',
        '1900-02-29',
        '2026-02-31',
        '2026-13-01',
        '2026-00-01',
        '2026-01-00',
        '0000-01-01',
        '2026-1-01',
        '',
    ])('拒绝非法日期 %s', (value) => {
        expect(isDayText(value)).toBe(false);
    });
});
