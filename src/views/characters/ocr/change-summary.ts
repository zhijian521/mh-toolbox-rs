import type { ReadonlyCharacter, PaneKey } from '../character';
import type { ReadonlyGearDetail, GearSlotName } from '../gear';
import { GEAR_STAT_GROUPS, gearStatGroup } from '../gear-properties';
import type { ReadonlyPet } from '../pets';
import { PET_QUALITY_FIELDS } from '../../../services/game-rules';
import type { PanelResult } from './use-ocr-draft';
import type { GearPanelResult } from './gear-panel';
import type { PetPanelResult } from './pet-panel';

export type OcrSnapshot = Record<string, string>;
export interface OcrChange {
    label: string;
    before: string;
    after: string;
}
export interface OcrReport {
    title: string;
    changes: OcrChange[];
    review: string[];
    note: string;
}

const identity: Record<string, string> = {
    name: '名称',
    level: '等级',
    school: '门派',
    guild: '帮派',
    expValue: '当前经验',
    expNeed: '升级经验',
};

/** 重复词条按所在组及出现次序区分；空表单占位不制造变更。 */
function rows(
    target: OcrSnapshot,
    prefix: string,
    values: readonly {
        label: string;
        value: string;
        extra?: string;
        gain?: boolean;
        group?: string;
    }[],
) {
    const counts = new Map<string, number>();
    for (const row of values) {
        if (!row.value && !row.extra) continue;
        const group = GEAR_STAT_GROUPS.find((one) => one.value === row.group)?.label;
        const label = `${prefix}${group ? `${group}·` : row.gain ? '附加·' : ''}${row.label}`;
        const index = (counts.get(label) ?? 0) + 1;
        counts.set(label, index);
        target[index === 1 ? label : `${label} ${index}`] = [
            row.value,
            row.extra ? `[${row.extra}]` : '',
        ]
            .filter(Boolean)
            .join(' ');
    }
}

export function gearSnapshot(
    detail: ReadonlyGearDetail | undefined,
    slot?: GearSlotName,
): OcrSnapshot {
    if (!detail) return {};
    const out: OcrSnapshot = {
        名称: detail.name,
        类型: detail.kind,
        等级: detail.level?.toString() ?? '',
        条件: detail.requires?.join('、') ?? '',
        描述: detail.flavor ?? '',
        制造者: detail.foot ?? '',
    };
    rows(
        out,
        '属性·',
        detail.stats.map((row) => ({ ...row, group: gearStatGroup(row, slot) })),
    );
    rows(out, '', detail.cond ?? []);
    rows(out, '', detail.lines ?? []);
    return out;
}

export function petSnapshot(pet: ReadonlyPet | null): OcrSnapshot {
    if (!pet) return {};
    const out: OcrSnapshot = {
        名称: pet.name,
        等级: String(pet.level),
        参战等级: String(pet.joinLevel),
        成长: pet.growth,
        寿命: String(pet.life),
        五行: pet.element,
        技能: pet.skills.join('、'),
        头像: pet.portrait ?? '',
        灵性: pet.spirit?.toString() ?? '',
    };
    for (const field of PET_QUALITY_FIELDS) {
        out[`${field.label}资质`] = String(pet.quality[field.key]);
    }
    rows(out, '属性·', pet.attrs);
    rows(out, '加点·', pet.points ?? []);
    return out;
}

export function characterSnapshot(character: ReadonlyCharacter, pane: PaneKey): OcrSnapshot {
    const out: OcrSnapshot = {};
    if (pane === 'attrs') {
        Object.assign(out, {
            名称: character.name,
            等级: String(character.level),
            门派: character.school,
            帮派: character.guild,
            当前经验: character.experience.value,
            升级经验: character.experience.need,
        });
        for (const group of character.attrGroups) rows(out, `${group.title}·`, group.rows);
    }
    if (pane === 'skills' || pane === 'attrs') {
        for (const row of character.skills) out[`师门·${row.name}`] = String(row.level);
    }
    if (pane === 'assist') {
        for (const row of character.assists) {
            out[`${row.kind === 'life' ? '生活' : '剧情'}·${row.name}`] = String(row.level);
        }
    }
    if (pane === 'training') {
        for (const group of character.trainings) {
            for (const row of group.rows) out[`${group.title}·${row.name}`] = String(row.level);
        }
    }
    if (pane === 'gear') {
        rows(out, '命魂之玉·', character.gearMeta.soul ?? []);
        for (const slot of character.gear) {
            for (const [label, value] of Object.entries(gearSnapshot(slot.detail, slot.slot))) {
                out[`${slot.slot}·${label}`] = value;
            }
        }
    }
    if (pane === 'pets') {
        character.pets.forEach((pet, index) => {
            for (const [label, value] of Object.entries(petSnapshot(pet))) {
                out[`召唤兽${index + 1}·${label}`] = value;
            }
        });
    }
    return out;
}

export function changeReport(
    title: string,
    before: OcrSnapshot,
    after: OcrSnapshot,
    review: string[] = [],
    note = '',
): OcrReport {
    const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .map((label) => ({ label, before: before[label] ?? '', after: after[label] ?? '' }))
        .filter((row) => row.before !== row.after);
    const cleared = changes.filter((row) => row.before && !row.after).map((row) => row.label);
    return {
        title,
        changes,
        review: [
            ...new Set([...review, ...cleared.map((label) => `${label}（覆盖后为空，请补录）`)]),
        ],
        note,
    };
}

export function panelReview(result: PanelResult): string[] {
    if (!result.value) return ['未识别到可写入项目'];
    const fields = result.pane === 'attrs' ? result.value.fields : result.value.rows;
    return fields
        .filter((row) => row.state !== 'ok')
        .map((row) => {
            const label = 'key' in row ? (identity[row.key] ?? row.key) : row.name;
            return `${label}（${row.state === 'guess' ? '识别存疑' : '未识别'}）`;
        });
}

export function gearReview(result: GearPanelResult): string[] {
    const review =
        result.hit < result.total ? [`${result.total - result.hit} 项未识别，请对照原图核对`] : [];
    return [...review, ...(result.related ?? []).flatMap(gearReview)];
}

export function petReview(result: PetPanelResult): string[] {
    const labels: [keyof PetPanelResult['patch'], string][] = [
        ['growth', '成长'],
        ['life', '寿命'],
        ['skills', '技能'],
    ];
    return [
        ...labels
            .filter(([key]) => result.patch[key] === undefined)
            .map(([, label]) => `${label}（未识别或未截图）`),
        ...(result.ambiguousSkills ?? []).map((names) => `技能待确认：${names.join(' / ')}`),
    ];
}

export const REPLACE_NOTE = '按截图覆盖当前装备或召唤兽，旧值清空项也列在下方；保存前请核对。';
