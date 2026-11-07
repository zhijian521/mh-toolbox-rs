import { isObject, rawText, rows, stamp as int } from '../../services/shape';
import type { GearDetail, GearStat, GearTone, Pet } from './character';

const optionalInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
const GEAR_TONES: GearTone[] = ['seal', 'ochre', 'moss'];
const asTone = (value: unknown): GearTone | undefined => GEAR_TONES.find((tone) => tone === value);
const text = rawText;
const optionalText = (value: unknown) => text(value) || undefined;

function normalizeGearStat(raw: unknown): GearStat | null {
    if (!isObject(raw)) return null;
    const label = text(raw.label);
    if (!label) return null;
    return {
        label,
        value: text(raw.value),
        extra: optionalText(raw.extra),
        gain: raw.gain === true ? true : undefined,
    };
}

function normalizeGearStats(raw: unknown): GearStat[] {
    return rows(raw).flatMap((stat) => {
        const normalized = normalizeGearStat(stat);
        return normalized ? [normalized] : [];
    });
}

export function normalizeGearDetail(raw: unknown): GearDetail | undefined {
    if (!isObject(raw)) return undefined;
    const name = text(raw.name);
    const kind = text(raw.kind);
    /* 名称与类型都没填 = 这件还没录，不是「一件没有名字的装备」。
     * 造一个空壳会让浮片浮出一张白纸——比什么都不弹更让人以为坏了。 */
    if (!name && !kind) return undefined;

    const requires = rows(raw.requires).map(text).filter(Boolean);
    const lines = rows(raw.lines).flatMap((line) => {
        if (!isObject(line)) return [];
        const label = text(line.label);
        if (!label) return [];
        return [{ label, value: text(line.value), tone: asTone(line.tone) }];
    });

    return {
        name: name || kind,
        flavor: optionalText(raw.flavor),
        kind,
        requires: requires.length ? requires : undefined,
        stats: normalizeGearStats(raw.stats),
        cond: normalizeGearStats(raw.cond),
        lines: lines.length ? lines : undefined,
        foot: optionalText(raw.foot),
    };
}

export function normalizePet(raw: unknown): Pet | null {
    if (!isObject(raw)) return null;
    const name = text(raw.name);
    if (!name) return null;
    const quality = isObject(raw.quality) ? raw.quality : {};
    const spirit = optionalInt(raw.spirit);

    return {
        name,
        level: int(raw.level),
        joinLevel: int(raw.joinLevel),
        quality: {
            attack: int(quality.attack),
            defense: int(quality.defense),
            hp: int(quality.hp),
            mp: int(quality.mp),
            speed: int(quality.speed),
            dodge: int(quality.dodge),
        },
        life: int(raw.life),
        growth: text(raw.growth),
        element: text(raw.element),
        attrs: rows(raw.attrs).flatMap((attr) => {
            if (!isObject(attr)) return [];
            const label = text(attr.label);
            return label ? [{ label, value: text(attr.value) }] : [];
        }),
        skills: rows(raw.skills).map(text).filter(Boolean),
        innerPills: rows(raw.innerPills).map(text).filter(Boolean),
        spirit,
    };
}
