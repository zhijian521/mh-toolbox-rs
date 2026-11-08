import { lifeSkills, storySkills } from '../../../services/game-data';
import type { AssistKind, AssistSkill, CharacterData } from '../character';
import type { OcrLine } from './attr-panel';
import type { IconHit } from './matcher';
import { levelBelow, type SkillHit } from './skill-panel';

/** 辅助截图没有技能名；图标确认身份，下面的数字确认等级。 */
export interface AssistHit extends SkillHit {
    kind: AssistKind;
}

export interface AssistPanelResult {
    rows: AssistHit[];
    hit: number;
    total: number;
}

function screenshotOrder(icons: readonly IconHit[]): IconHit[] {
    const bands: IconHit[][] = [];
    for (const icon of [...icons].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
        const band = bands[bands.length - 1];
        // 同排边框的检测位置可能略有高低，先归到一排再按横坐标排序。
        if (
            band &&
            icon.box.y - band[0].box.y < Math.min(icon.box.height, band[0].box.height) / 2
        ) {
            band.push(icon);
        } else {
            bands.push([icon]);
        }
    }
    return bands.flatMap((band) => band.sort((a, b) => a.box.x - b.box.x));
}

export function parseAssistPanel(
    lines: readonly OcrLine[],
    icons: readonly IconHit[],
): AssistPanelResult {
    const names = new Map<string, AssistKind>([
        ...lifeSkills().map((name): [string, AssistKind] => [name, 'life']),
        ...storySkills().map((name): [string, AssistKind] => [name, 'story']),
    ]);
    const seen = new Set<string>();
    const matched = [...icons]
        .sort((a, b) => b.score - a.score)
        .filter((icon) => {
            if (!names.has(icon.name) || icon.score < 0.6 || seen.has(icon.name)) return false;
            seen.add(icon.name);
            return true;
        });
    const rows: AssistHit[] = [];
    for (const icon of screenshotOrder(matched)) {
        const kind = names.get(icon.name);
        if (!kind) continue;
        const level = levelBelow(
            icon.box,
            lines.filter((line) => line.width <= icon.box.width * 1.2),
        );
        rows.push({
            name: icon.name,
            kind,
            level: level?.value ?? 0,
            state: level ? 'guess' : 'miss',
            score: level ? Math.min(icon.score, level.score || 1) : 0,
        });
    }
    return {
        rows,
        hit: rows.filter((row) => row.state === 'ok' || row.state === 'guess').length,
        total: rows.length,
    };
}

/** 覆盖本次识别到的生活或剧情组，另一组保持原样；同名技能保留已有上限与状态。 */
export function applyAssistPanel(
    character: CharacterData,
    rows: readonly AssistHit[],
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
            .map((row) => [`${row.kind}-${row.name}`, row]),
    );
    const previous = new Map(character.assists.map((row) => [`${row.kind}-${row.name}`, row]));
    const groups = new Map<AssistKind, AssistSkill[]>();
    for (const row of found.values()) {
        const group = groups.get(row.kind) ?? [];
        group.push({
            ...previous.get(`${row.kind}-${row.name}`),
            name: row.name,
            kind: row.kind,
            level: row.level,
        });
        groups.set(row.kind, group);
    }
    const assists = (['life', 'story'] as const).flatMap(
        (kind) => groups.get(kind) ?? character.assists.filter((row) => row.kind === kind),
    );
    return { ...character, assists };
}
