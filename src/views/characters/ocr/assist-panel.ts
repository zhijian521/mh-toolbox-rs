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

export function parseAssistPanel(
    lines: readonly OcrLine[],
    icons: readonly IconHit[],
): AssistPanelResult {
    const names = new Map<string, AssistKind>([
        ...lifeSkills().map((name): [string, AssistKind] => [name, 'life']),
        ...storySkills().map((name): [string, AssistKind] => [name, 'story']),
    ]);
    const seen = new Set<string>();
    const rows: AssistHit[] = [];
    for (const icon of [...icons].sort((a, b) => b.score - a.score)) {
        const kind = names.get(icon.name);
        if (!kind || icon.score < 0.6 || seen.has(icon.name)) continue;
        seen.add(icon.name);
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

/** 生活与剧情分别按类目和名字合并，截图外的技能、上限与状态保持原样。 */
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
    const assists = character.assists.map((row): AssistSkill => {
        const key = `${row.kind}-${row.name}`;
        const hit = found.get(key);
        found.delete(key);
        return hit ? { ...row, level: hit.level } : row;
    });
    for (const row of found.values()) {
        assists.push({ name: row.name, kind: row.kind, level: row.level });
    }
    return { ...character, assists };
}
