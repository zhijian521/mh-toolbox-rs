import { PET_QUALITY_FIELDS } from '../../../services/game-rules';
import type { PetPanelRules } from '../../../services/pet-assets';
import type { OcrLine } from './attr-panel';

const clean = (text: string) => text.replace(/\s+/g, '');
const cy = (line: OcrLine) => line.y + line.height / 2;
const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

/** 宽字距会把「寿命 / 成长 / 五行」竖读成两列，利用六资质的行距定位实际读数。 */
export function petPanelLines(lines: readonly OcrLine[], rules: PetPanelRules): OcrLine[] {
    const readable = lines.filter((line) => (line.score ?? 1) >= 0.45 && line.height > 0);
    const suffix = rules.labels.qualityTitle.slice(-2);
    const anchors = PET_QUALITY_FIELDS.flatMap((field, index) => {
        const label = readable.find((line) => clean(line.text) === `${field.label}${suffix}`);
        if (!label) return [];
        const value = readable
            .filter(
                (line) =>
                    /^\d{2,6}$/.test(clean(line.text)) &&
                    Math.abs(cy(line) - cy(label)) < label.height * 0.6 &&
                    line.x > label.x + label.width &&
                    line.x - label.x - label.width < label.height * 6,
            )
            .sort((a, b) => a.x - b.x)[0];
        return value ? [{ label, value, index }] : [];
    });
    if (anchors.length < 3) return [...lines];
    const steps = anchors
        .slice(1)
        .map(
            (anchor, i) =>
                (cy(anchor.value) - cy(anchors[i].value)) / (anchor.index - anchors[i].index),
        );
    const step = median(steps);
    const rowHeight = median(anchors.map(({ value }) => value.height));
    if (step < rowHeight || step > rowHeight * 3) return [...lines];
    const valueX = median(anchors.map(({ value }) => value.x));
    const labelX = median(anchors.map(({ label }) => label.x));
    const startY = median(anchors.map(({ value, index }) => cy(value) - index * step));
    const recovered: OcrLine[] = [];
    for (const [i, key] of rules.qualityTail.entries()) {
        const label = rules.labels[key];
        if (readable.some((line) => clean(line.text).startsWith(label))) continue;
        const targetY = startY + (PET_QUALITY_FIELDS.length + i) * step;
        const value = readable
            .filter((line) => {
                if (Math.abs(line.x - valueX) > rowHeight) return false;
                if (Math.abs(cy(line) - targetY) > step * 0.4) return false;
                const text = clean(line.text);
                if (key === 'element') return rules.elements.includes(text);
                return key === 'growth' ? /^\d[.,]\d{1,3}$/.test(text) : /^\d{1,7}$/.test(text);
            })
            .sort((a, b) => Math.abs(cy(a) - targetY) - Math.abs(cy(b) - targetY))[0];
        if (!value) continue;
        recovered.push({
            ...value,
            text: label + clean(value.text).replace(',', '.'),
            x: labelX,
            width: value.x + value.width - labelX,
        });
    }
    return [...lines, ...recovered];
}
