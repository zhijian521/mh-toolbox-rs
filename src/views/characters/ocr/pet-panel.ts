import type { PetPanelRules } from '../../../services/pet-assets';
import { PET_QUALITY_FIELDS } from '../../../services/game-rules';
import { normalizePet } from '../details';
import type { Pet } from '../pets';
import type { OcrLine } from './attr-panel';
import { petPanelLines } from './pet-panel-layout';

export type PetPatch = Partial<Omit<Pet, 'quality'>> & { quality?: Partial<Pet['quality']> };
export interface PetPanelResult {
    patch: PetPatch;
    hit: number;
    skillCount: number;
}
const clean = (text: string) => text.replace(/\s+/g, '').replace(/[：:]/g, '');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cy = (line: OcrLine) => line.y + line.height / 2;
const sameRow = (a: OcrLine, b: OcrLine) =>
    Math.abs(cy(a) - cy(b)) < Math.max(a.height, b.height) * 0.6;

export function petLevelLines(lines: readonly OcrLine[], rules: PetPanelRules): OcrLine[] {
    const title = lines.find((line) => clean(line.text).includes(rules.labels.attributeTitle));
    const attributes = lines.filter(
        (line) =>
            !clean(line.text).includes(rules.labels.qualityTitle.slice(-2)) &&
            rules.attributes.some((label) => clean(line.text).startsWith(label)),
    );
    if (!attributes.length) return [];
    const top = Math.min(...attributes.map((line) => line.y));
    return lines.filter(
        (line) =>
            new RegExp(`^\\d{1,3}${escape(rules.labels.level)}$`).test(clean(line.text)) &&
            line.y < top &&
            (!title || line.x < title.x),
    );
}

/** 分框与合框都按标签位置取右侧的值，资质标签先于同名战斗属性匹配。 */
export function parsePetPanel(
    lines: readonly OcrLine[],
    rules: PetPanelRules,
    selectedLevel?: OcrLine,
): PetPanelResult {
    const patch: PetPatch = {};
    const values = new Map<string, string>();
    const qualityLabels = PET_QUALITY_FIELDS.map(
        (field) => `${field.label}${rules.labels.qualityTitle.slice(-2)}`,
    );
    const labels = [
        ...qualityLabels,
        ...rules.attributes,
        ...rules.points,
        ...Object.keys(rules.aliases),
        rules.labels.joinLevel,
        rules.labels.life,
        rules.labels.growth,
        rules.labels.element,
    ];
    const pattern = new RegExp(
        [...new Set(labels)]
            .sort((a, b) => b.length - a.length)
            .map(escape)
            .join('|'),
        'g',
    );
    const readable = petPanelLines(lines, rules).filter(
        (line) => (line.score ?? 1) >= 0.45 && line.height > 0,
    );
    for (const line of readable) {
        const text = clean(line.text);
        const matches = [...text.matchAll(pattern)];
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const label = match[0];
            const end = (match.index ?? 0) + label.length;
            let raw = text.slice(end, matches[i + 1]?.index);
            if (!raw) {
                const right = readable
                    .filter(
                        (one) =>
                            one !== line &&
                            sameRow(line, one) &&
                            one.x >= line.x + line.width - line.height * 0.4 &&
                            one.x - line.x - line.width < line.height * 8,
                    )
                    .sort((a, b) => a.x - b.x)[0];
                raw = right ? clean(right.text) : '';
            }
            const key = rules.aliases[label] ?? label;
            if (label === rules.labels.element) {
                if (/^[\p{Script=Han}]{1}$/u.test(raw)) values.set(key, raw);
                continue;
            }
            // 只接受整个读数；不把旁边的标签、经验或百分比拼进来。
            const number = raw.replace(/[ＯOo]/g, '0').replace(/[lI]/g, '1');
            if (!/^\d{1,7}(?:\.\d{1,3}|[/／]\d{1,7})?$/.test(number)) continue;
            const parts = number.split(/[/／]/);
            const value = rules.resources.includes(key) ? parts.at(-1)! : parts[0];
            if (key !== rules.labels.growth && !/^\d+$/.test(value)) continue;
            if (!values.has(key)) values.set(key, value);
        }
    }
    patch.attrs = rules.attributes.flatMap((label) =>
        values.has(label) ? [{ label, value: values.get(label)! }] : [],
    );
    patch.points = rules.points.flatMap((label) =>
        values.has(label) ? [{ label, value: values.get(label)! }] : [],
    );
    patch.quality = {};
    for (let i = 0; i < qualityLabels.length; i++) {
        const value = values.get(qualityLabels[i]);
        if (value !== undefined) patch.quality[PET_QUALITY_FIELDS[i].key] = Number(value);
    }
    for (const key of ['joinLevel', 'life'] as const) {
        const value = values.get(rules.labels[key]);
        if (value !== undefined) patch[key] = Number(value);
    }
    for (const key of ['growth', 'element'] as const) {
        const value = values.get(rules.labels[key]);
        if (value !== undefined) patch[key] = value;
    }
    const rename = readable.find((line) => clean(line.text).includes(rules.labels.rename));
    if (rename) {
        const before = readable
            .filter(
                (line) =>
                    line !== rename &&
                    sameRow(line, rename) &&
                    line.x + line.width <= rename.x + rename.height * 0.3 &&
                    rename.x - line.x < rename.height * 12,
            )
            .sort((a, b) => b.x - a.x)[0];
        const name = before?.text.trim();
        if (name && !/[:：/]/.test(name) && name.length <= 32) patch.name = name;
    }
    // 多只召唤兽时由原图选中背景定位；文字解析器不猜第一只就是当前兽。
    const levels = petLevelLines(readable, rules);
    const levelLine = selectedLevel ?? (levels.length === 1 ? levels[0] : undefined);
    if (levelLine && levels.includes(levelLine))
        patch.level = Number(clean(levelLine.text).replace(rules.labels.level, ''));
    if (!patch.name && levelLine) {
        const above = readable
            .filter(
                (line) =>
                    line.x >= levelLine.x - levelLine.height &&
                    line.x < levelLine.x + levelLine.width &&
                    line.y < levelLine.y &&
                    levelLine.y - line.y < levelLine.height * 2.5 &&
                    !line.text.includes(rules.labels.attributeTitle),
            )
            .sort((a, b) => b.y - a.y)[0];
        if (above) patch.name = above.text.trim();
    }
    const hit = values.size + Number(patch.name !== undefined) + Number(patch.level !== undefined);
    return { patch, hit, skillCount: 0 };
}

/** 重新识别整只覆盖，漏项回到空值；只给未读到的名字兜底，取消由外层草稿隔离。 */
export function applyPetPanel(base: Pet, result: PetPanelResult): Pet {
    if (!result.hit) return base;
    return normalizePet({
        ...result.patch,
        name: result.patch.name?.trim() || base.name || '未命名',
        skills: [...new Set(result.patch.skills ?? [])],
    })!;
}

export function emptyPet(): Pet {
    return normalizePet({ name: '未命名' })!;
}
