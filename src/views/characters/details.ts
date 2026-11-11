import { isObject, optionalInt, rawText, rows, stamp as int } from '../../services/shape';
import {
    GEAR_JADE_EFFECTS,
    hasGearDetail,
    type GearDetail,
    type GearStat,
    type GearTone,
} from './gear';
import type { Pet } from './pets';
import { GEAR_STAT_GROUPS } from './gear-properties';

const GEAR_TONES: GearTone[] = ['seal', 'ochre', 'moss'];
const asTone = (value: unknown): GearTone | undefined => GEAR_TONES.find((tone) => tone === value);
const text = rawText;
const optionalText = (value: unknown) => text(value) || undefined;

function normalizeGearStat(raw: unknown): GearStat | null {
    if (!isObject(raw)) return null;
    const label = text(raw.label);
    if (!label) return null;
    if (raw.group === 'base' && !text(raw.value).trim() && !text(raw.extra).trim()) return null;
    return {
        label,
        value: text(raw.value),
        group: GEAR_STAT_GROUPS.find((group) => group.value === raw.group)?.value,
        extra:
            raw.group === 'trait' || GEAR_JADE_EFFECTS.some((one) => one === label)
                ? undefined
                : optionalText(raw.extra),
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
    /* 等级与条件分家（2026-11-11）：旧档把「等级 80」和「五行 木 / 男」一起记在
     * `requires` 里通栏显示，界面也只有一个文本框。现在只编等级，于是把那条「等级 N」
     * 抽到 `level`，其余条件留在 `requires` 里给浮片读——两条都不丢，界面只露第一条。 */
    const requires = rows(raw.requires).map(text).filter(Boolean);
    const legacyLevel = requires.map((one) => /^等级\s*(\d{1,3})$/.exec(one)).find(Boolean);
    const level = optionalInt(raw.level) ?? (legacyLevel ? Number(legacyLevel[1]) : undefined);
    const conditions = requires.filter((one) => !/^等级\s*\d+$/.test(one));
    const lines = rows(raw.lines).flatMap((line) => {
        if (!isObject(line)) return [];
        const label = text(line.label);
        if (!label) return [];
        return [{ label, value: text(line.value), tone: asTone(line.tone) }];
    });

    const detail: GearDetail = {
        name: name || kind,
        flavor: optionalText(raw.flavor),
        kind,
        level,
        requires: conditions.length ? conditions : undefined,
        stats: normalizeGearStats(raw.stats),
        cond: normalizeGearStats(raw.cond),
        lines: lines.length ? lines : undefined,
        foot: optionalText(raw.foot),
        note: text(raw.note).trim() || undefined,
    };
    return hasGearDetail(detail) ? detail : undefined;
}

export function normalizePet(raw: unknown): Pet | null {
    if (!isObject(raw)) return null;
    const name = text(raw.name).trim();
    if (!name) return null;
    const quality = isObject(raw.quality) ? raw.quality : {};
    const spirit = optionalInt(raw.spirit);

    return {
        name,
        portrait: text(raw.portrait),
        points: rows(raw.points).flatMap((point) => {
            if (!isObject(point)) return [];
            const label = text(point.label);
            return label ? [{ label, value: text(point.value) }] : [];
        }),
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
