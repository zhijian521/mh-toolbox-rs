import { schoolSkillCap } from '../../../services/game-data';
import type { CharacterData, SkillRow } from '../character';
import { schoolSkillNames, schoolSkills } from '../schools';
import type { OcrLine, OcrState } from './attr-panel';

/** 师门只识别带技能名的深蓝列表，等级与名字按相邻行配对。 */
export interface SkillHit {
    name: string;
    level: number;
    state: OcrState;
    score: number;
}

export interface SkillPanelResult {
    rows: SkillHit[];
    hit: number;
    total: number;
}

const CONFUSABLE: Record<string, string> = {
    遁: '适',
    适: '遁',
    贡: '责',
    责: '贡',
    力: 'カ',
};

function fold(text: string): string {
    return [...text].map((char) => CONFUSABLE[char] ?? char).join('');
}

function distance(a: string, b: string): number {
    const left = [...a];
    const right = [...b];
    let prev = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        const next = [i];
        for (let j = 1; j <= right.length; j += 1) {
            next[j] = Math.min(
                prev[j] + 1,
                next[j - 1] + 1,
                prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
            );
        }
        prev = next;
    }
    return prev[right.length];
}

function likeness(text: string, name: string): number {
    const a = fold(text.trim());
    const b = fold(name);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length === b.length && distance(a, b) === 1) return 0.8;
    if (a.length > b.length && a.includes(b)) return 0.6;
    if (b.length > a.length && a.length >= 2 && b.includes(a)) return 0.6;
    return 0;
}

interface Anchor {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 师门的名字与辅助的图标都只取正下方的等级，页码和隔壁格的数字不参与。 */
export function levelBelow(
    anchor: Anchor,
    lines: readonly OcrLine[],
): { value: number; score: number } | undefined {
    let best: { value: number; score: number; gap: number } | undefined;
    for (const line of lines) {
        const text = line.text.trim();
        if (!/^\d{1,3}$/.test(text) || Number(text) > 200) continue;
        const overlap =
            Math.min(anchor.x + anchor.width, line.x + line.width) - Math.max(anchor.x, line.x);
        if (overlap < Math.min(8, line.width * 0.5)) continue;
        const gap = line.y - (anchor.y + anchor.height);
        if (gap < -line.height * 0.5 || gap > Math.max(line.height, anchor.height * 0.6)) continue;
        if (!best || Math.abs(gap) < Math.abs(best.gap)) {
            best = { value: Number(text), score: line.score ?? 0, gap };
        }
    }
    return best;
}

export function parseSkillPanel(
    lines: readonly OcrLine[],
    names: readonly string[],
): SkillPanelResult {
    const taken = new Set<OcrLine>();
    const rows = names.map((name): SkillHit => {
        let best: { line: OcrLine; score: number } | undefined;
        for (const line of lines) {
            if (taken.has(line)) continue;
            const score = likeness(line.text, name);
            if (score > 0 && (!best || score > best.score)) best = { line, score };
        }
        if (!best) return { name, level: 0, state: 'miss', score: 0 };
        taken.add(best.line);
        const level = levelBelow(best.line, lines);
        if (!level) return { name, level: 0, state: 'miss', score: 0 };
        const score = Math.min(best.score, level.score || 1);
        return { name, level: level.value, state: score >= 0.9 ? 'ok' : 'guess', score };
    });
    return {
        rows,
        hit: rows.filter((row) => row.state === 'ok' || row.state === 'guess').length,
        total: rows.length,
    };
}

/** 只覆盖识别成功的等级，缺项保留原值，上限仍由门派表提供。 */
export function applySkillPanel(
    character: CharacterData,
    rows: readonly SkillHit[],
): CharacterData {
    if (!schoolSkillNames(character.school)) return character;
    const byName = new Map(rows.map((row) => [row.name, row]));
    const base = schoolSkills(character.school, character.skills);
    return {
        ...character,
        skills: base.map((row): SkillRow => {
            const hit = byName.get(row.name);
            if (!hit || (hit.state !== 'ok' && hit.state !== 'guess')) return row;
            return { ...row, level: hit.level, cap: row.cap ?? schoolSkillCap() };
        }),
    };
}
