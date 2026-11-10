import { describe, expect, it, vi } from 'vitest';
import { isObject, makeId, optionalInt, rawText, rows, stamp, text } from './shape';

/**
 * 形状兜底是**所有读档路径的最后一米**：坏数据在这几个函数里变成可渲染的形状，
 * 再往上就没有第二道防线了。它们此前一条测试都没有——不是漏了，是当时那两段
 * 「老 localStorage 搬进 SQLite」的迁移块没人测得动，连带整份文件一起搁着
 * （理由写在 `shape.ts` 头部的最后一节）。迁移块第 108 批已删，这几条才补得上。
 *
 * 断言的重点不是「好数据原样通过」，而是**坏数据不抛异常、也不变成别的意思**。
 */
describe('形状兜底', () => {
    it('isObject 只挡 null：数组也算对象', () => {
        /* 这条看着反直觉，但它是**刻意的**：调用方要数组时用 `rows`，这里再从数组
         * 里多挡一次，会让「`rows` 能收、`isObject` 不收」变成一条没人记得的例外。 */
        expect(isObject({})).toBe(true);
        expect(isObject([])).toBe(true);
        expect(isObject(null)).toBe(false);
        expect(isObject('{}')).toBe(false);
        expect(isObject(undefined)).toBe(false);
    });

    it('text 去首尾空白，认不出就是空串', () => {
        expect(text('  黑宝石 ')).toBe('黑宝石');
        /* 中间的空格不能动：那是名字本身的一部分（「天狗（人形）· 二代」这类）。 */
        expect(text('天狗 二代')).toBe('天狗 二代');
        expect(text(123)).toBe('');
        expect(text(null)).toBe('');
        expect(text(undefined)).toBe('');
    });

    it('rawText 原样保留——「要不要 trim」是调用方显式选的', () => {
        expect(rawText('  归ω岚 ')).toBe('  归ω岚 ');
        expect(rawText(0)).toBe('');
        expect(rawText({})).toBe('');
    });

    it('stamp 取整，非有限数一律 0', () => {
        expect(stamp(12.4)).toBe(12);
        expect(stamp(12.6)).toBe(13);
        /* `NaN` 参与比较函数会让整列排序变成未定义行为，写进 JSON 又变 `null`，
         * 读回来再算就是另一个故事——所以入口处就归零。 */
        expect(stamp(Number.NaN)).toBe(0);
        expect(stamp(Number.POSITIVE_INFINITY)).toBe(0);
        expect(stamp('12')).toBe(0);
        /* 毫秒时间戳约 1.7e12，超过 2^31。用 `| 0` 取整会溢出成负数，
         * 所以实现必须是 `Math.round`——这条断言就是在钉这件事。 */
        expect(stamp(1_763_000_000_000)).toBe(1_763_000_000_000);
    });

    it('optionalInt 保留 0 与大整数，缺失值不补成 0，也不强转数字字符串', () => {
        expect(optionalInt(0)).toBe(0);
        expect(optionalInt(12.6)).toBe(13);
        expect(optionalInt(1_763_000_000_000)).toBe(1_763_000_000_000);
        for (const value of [undefined, null, '', '12', false, NaN, Infinity, -Infinity]) {
            expect(optionalInt(value)).toBeUndefined();
        }
    });

    it('rows 认不出就是空数组，认出就原样返回', () => {
        const list = [{ id: 'a' }];
        expect(rows(list)).toBe(list);
        expect(rows({ length: 1 })).toEqual([]);
        expect(rows('[]')).toEqual([]);
        expect(rows(null)).toEqual([]);
    });

    it('makeId 带前缀，且两次不一样', () => {
        const one = makeId('char');
        const two = makeId('char');
        expect(one.startsWith('char-')).toBe(true);
        expect(one).not.toBe(two);
    });

    it('没有 randomUUID 时退回时间戳 + 随机后缀，仍带前缀', () => {
        /* WebView2 与 Node 19+ 都有 `randomUUID`，但这条回落分支存在就得能跑：
         * 它是「够随机」而不是「全局唯一」，调用方据此只能当新建用。 */
        vi.stubGlobal('crypto', undefined);
        try {
            const id = makeId('pt');
            expect(id).toMatch(/^pt-[a-z0-9]+-[a-z0-9]+$/);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
