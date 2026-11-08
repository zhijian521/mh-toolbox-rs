import { describe, expect, it } from 'vitest';
import { minuteText, normalizeTime } from './clock';

describe('时刻归一', () => {
    it('补前导零，认全角冒号与不带冒号的四位', () => {
        expect(normalizeTime('7:5')).toBe('07:05');
        expect(normalizeTime('07：05')).toBe('07:05');
        expect(normalizeTime('0705')).toBe('07:05');
        expect(normalizeTime('7')).toBe('07:00');
        expect(normalizeTime(' 23:59 ')).toBe('23:59');
    });

    it('越界与乱写返回 null', () => {
        expect(normalizeTime('24:00')).toBeNull();
        expect(normalizeTime('12:60')).toBeNull();
        expect(normalizeTime('abc')).toBeNull();
        expect(normalizeTime('')).toBeNull();
    });

    it('取分钟补成两位，不带占位的小时', () => {
        expect(minuteText('00:30')).toBe('30');
        expect(minuteText('07:05')).toBe('05');
    });
});
