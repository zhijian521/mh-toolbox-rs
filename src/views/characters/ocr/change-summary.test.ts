import { describe, expect, it } from 'vitest';
import '../../../services/game-data.fixture';
import {
    changeReport,
    characterSnapshot,
    gearSnapshot,
    panelReview,
    petReview,
} from './change-summary';
import { useOcrDraft } from './use-ocr-draft';
import { normalizeCharacter } from '../roster';

describe('OCR 变更摘要', () => {
    it('未识别不制造变更，识别为零按实际修改，摘要不随后续手改漂移', () => {
        const editor = useOcrDraft(normalizeCharacter({ id: 'one', name: '角色', level: 109 }));
        const hp = editor.draft.value.attrGroups
            .flatMap((group) => group.rows)
            .find((row) => row.label === '气血')!;
        hp.value = '1000';
        const before = characterSnapshot(editor.draft.value, 'attrs');
        const result = {
            pane: 'attrs' as const,
            value: {
                hit: 1,
                total: 2,
                fields: [
                    { key: '气血', raw: '0', value: '0', state: 'guess' as const, score: 0.8 },
                    { key: 'name', raw: '', value: '', state: 'miss' as const, score: 0 },
                ],
            },
        };
        editor.recognize(result, 'shot-one');
        const report = changeReport(
            '第一张',
            before,
            characterSnapshot(editor.draft.value, 'attrs'),
            panelReview(result),
        );
        expect(report.changes).toHaveLength(1);
        expect(report.changes[0]).toMatchObject({ before: '1000', after: '0' });
        expect(report.changes[0].label).toContain('气血');
        expect(report.review).toEqual(['气血（识别存疑）', '名称（未识别）']);
        editor.draft.value.attrGroups
            .flatMap((group) => group.rows)
            .find((row) => row.label === '气血')!.value = '2000';
        expect(report.changes[0].after).toBe('0');
        expect(editor.draft.value.name).toBe('角色');
    });

    it('重复附加词条不被合并，空基础占位不算变更，旧词条清空须核对', () => {
        const before = gearSnapshot(
            {
                name: '戒指',
                kind: '',
                stats: [
                    { label: '伤害', value: '+8', gain: true },
                    { label: '伤害', value: '+9', gain: true },
                ],
            },
            '戒指',
        );
        const after = gearSnapshot(
            {
                name: '戒指',
                kind: '',
                stats: [
                    { label: '伤害', value: '+11', gain: true },
                    { label: '防御', value: '' },
                ],
            },
            '戒指',
        );
        const report = changeReport('戒指', before, after);
        expect(report.changes).toHaveLength(2);
        expect(report.changes.map((row) => [row.before, row.after])).toEqual([
            ['+8', '+11'],
            ['+9', ''],
        ]);
        expect(report.review).toHaveLength(1);
        expect(changeReport('相同截图', after, after).changes).toEqual([]);
    });

    it('技能图标存疑、成长和寿命未读到时给出核对项', () => {
        const review = petReview({
            patch: {},
            hit: 1,
            skillCount: 0,
            ambiguousSkills: [['必杀', '高级必杀']],
        });
        expect(review).toContain('成长（未识别或未截图）');
        expect(review).toContain('寿命（未识别或未截图）');
        expect(review).toContain('技能待确认：必杀 / 高级必杀');
    });
});
