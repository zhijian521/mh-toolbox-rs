import { TRAINING_GROUPS, type CharacterData } from '../character';
import type { OcrLine } from './attr-panel';
import type { SkillHit } from './skill-panel';

export interface TrainingPanelResult {
    rows: SkillHit[];
    hit: number;
    total: number;
}

const NAMES = TRAINING_GROUPS.flatMap((group) => group.rows.map((row) => row.name));

function compact(text: string): string {
    return text.normalize('NFKC').replace(/\s/g, '');
}

function sameRow(a: OcrLine, b: OcrLine): boolean {
    const height = Math.min(a.height, b.height);
    return height > 0 && Math.abs(a.y + a.height / 2 - b.y - b.height / 2) <= height * 0.6;
}

/** 一行只取「等级」的分子，经验与分母都不作为写入字段。 */
function readLevel(text: string): number | undefined {
    const value = text.split(/(?:修炼)?经验/)[0].replace(/^:/, '');
    const matched = /^(?:等级:?)?(\d{1,3})(?:\/(\d{1,2}))?$/.exec(value);
    if (!matched || (!value.startsWith('等级') && !matched[2])) return;
    const level = Number(matched[1]);
    const cap = matched[2] ? Number(matched[2]) : undefined;
    if (level > 200 || (cap !== undefined && (cap <= 0 || level > cap))) return;
    return level;
}

export function parseTrainingPanel(lines: readonly OcrLine[]): TrainingPanelResult {
    const rows = NAMES.map((name): SkillHit => {
        let best: SkillHit = { name, level: 0, state: 'miss', score: 0 };
        for (const anchor of lines) {
            if (!compact(anchor.text).includes(name)) continue;
            const band = lines.filter((line) => sameRow(anchor, line)).sort((a, b) => a.x - b.x);
            const text = band.map((line) => compact(line.text)).join('');
            // 多行被合并成一个框时不按出现顺序猜，避免经验串进另一项等级。
            if (NAMES.filter((label) => text.includes(label)).length !== 1) continue;
            const level = readLevel(text.slice(text.indexOf(name) + name.length));
            if (level === undefined) continue;
            const score = Math.min(...band.map((line) => line.score || 1));
            if (best.state !== 'miss' && score <= best.score) continue;
            best = { name, level, state: score >= 0.9 ? 'ok' : 'guess', score };
        }
        return best;
    });
    return {
        rows,
        hit: rows.filter((row) => row.state === 'ok' || row.state === 'guess').length,
        total: rows.length,
    };
}

/** 按项名更新等级；截图之外的项、已有上限和其他角色字段保持原值。 */
export function applyTrainingPanel(
    character: CharacterData,
    rows: readonly SkillHit[],
): CharacterData {
    const found = new Map(
        rows
            .filter(
                (row) =>
                    (row.state === 'ok' || row.state === 'guess') &&
                    Number.isInteger(row.level) &&
                    row.level >= 0 &&
                    row.level <= 200,
            )
            .map((row) => [row.name, row.level]),
    );
    return {
        ...character,
        trainings: character.trainings.map((group) => ({
            ...group,
            rows: group.rows.map((row) => {
                const level = found.get(row.name);
                return level === undefined ? row : { ...row, level };
            }),
        })),
    };
}
