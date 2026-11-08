import { describe, expect, it } from 'vitest';
import '../../../services/game-data.fixture';
import { normalizeCharacter } from '../roster';
import type { OcrField } from './attr-panel';
import { useOcrDraft, type PanelResult } from './use-ocr-draft';

const character = () => normalizeCharacter({ id: 'draft', name: '原角色', school: '五庄观' });
const attrs = (key: string, value: string): PanelResult => ({
    pane: 'attrs',
    value: {
        fields: [{ key, value, raw: value, state: 'guess', score: 1 } satisfies OcrField],
        hit: 1,
        total: 1,
    },
});

describe('截图编辑草稿', () => {
    it('修炼固定十项，未录入等级为 0，上限使用游戏默认值', () => {
        const editor = useOcrDraft(character());
        const rows = editor.draft.value.trainings.flatMap((group) => group.rows);
        expect(rows).toHaveLength(10);
        expect(rows.every((row) => row.level === 0)).toBe(true);
        expect(rows.every((row) => row.cap === (row.name === '育兽术' ? 35 : 20))).toBe(true);
    });

    it('未上传或未识别的项目也可补录、修改与清空，原角色不变', () => {
        const before = character();
        const editor = useOcrDraft(before);
        expect(editor.changed.value).toBe(false);
        editor.setValue('name', '修正名称');
        editor.setValue('server', '紫禁城');
        editor.setValue('guild', '修正帮派');
        editor.setValue('level', '109');
        editor.setValue('气血', '4500');
        editor.setValue('乾元丹', '3');
        editor.setValue('experience.value', '120万');
        const rows = () => editor.draft.value.attrGroups.flatMap((group) => group.rows);
        expect(editor.draft.value).toMatchObject({
            name: '修正名称',
            server: '紫禁城',
            guild: '修正帮派',
            level: 109,
        });
        expect(rows().find((row) => row.label === '气血')?.value).toBe('4500');
        expect(rows().find((row) => row.label === '乾元丹')?.value).toBe('3');
        editor.setValue('气血', '');
        editor.setValue('experience.value', '');
        expect(rows().find((row) => row.label === '气血')?.value).toBe('');
        expect(editor.draft.value.experience.value).toBe('');
        expect(editor.changed.value).toBe(true);
        expect(before).toEqual(character());
    });

    it('仅清空原有数值也算修改，保存归一化不带回旧值', () => {
        const before = character();
        before.attrGroups[0].rows[0].value = '4500';
        before.experience = { value: '120万', need: '80万' };
        before.trainings[0].rows[0].level = 11;
        const editor = useOcrDraft(before);
        editor.setValue('气血', '');
        editor.setValue('experience.value', '');
        editor.setValue('experience.need', '');
        editor.setTraining(before.trainings[0].rows[0].name, 0);
        expect(editor.changed.value).toBe(true);
        const saved = normalizeCharacter(editor.draft.value);
        expect(saved.attrGroups[0].rows[0].value).toBe('');
        expect(saved.experience).toEqual({ value: '', need: '' });
        expect(saved.trainings[0].rows[0].level).toBe(0);
        expect(before.attrGroups[0].rows[0].value).toBe('4500');
    });

    it('同图切回不覆盖手工修正，新图覆盖识别项并保留其他分区', () => {
        const editor = useOcrDraft(character());
        editor.recognize(attrs('气血', '1000'), 'shot-1');
        editor.setValue('气血', '4500');
        editor.setValue('乾元丹', '3');
        const name = editor.draft.value.skills[0].name;
        editor.setSkill(name, 150);
        editor.recognize(attrs('气血', '1000'), 'shot-1');
        expect(editor.draft.value.attrGroups[0].rows[0].value).toBe('4500');
        editor.recognize(attrs('气血', '4600'), 'shot-2');
        expect(editor.draft.value.attrGroups[0].rows[0].value).toBe('4600');
        expect(editor.draft.value.skills[0].level).toBe(150);
        expect(
            editor.draft.value.attrGroups
                .flatMap((group) => group.rows)
                .find((row) => row.label === '乾元丹')?.value,
        ).toBe('3');
    });

    it('四类识别仅更新当前分区，保留其他分区尚未填完的草稿', () => {
        const skill = useOcrDraft(character()).draft.value.skills[0].name;
        const training = character().trainings[0].rows[0].name;
        const panels: PanelResult[] = [
            attrs('气血', '1000'),
            {
                pane: 'skills',
                value: {
                    rows: [{ name: skill, level: 150, state: 'ok', score: 1 }],
                    hit: 1,
                    total: 1,
                },
            },
            {
                pane: 'assist',
                value: {
                    rows: [{ name: '变化之术', kind: 'story', level: 6, state: 'ok', score: 1 }],
                    hit: 1,
                    total: 1,
                },
            },
            {
                pane: 'training',
                value: {
                    rows: [{ name: training, level: 12, state: 'ok', score: 1 }],
                    hit: 1,
                    total: 1,
                },
            },
        ];
        for (const panel of panels) {
            const before = character();
            const editor = useOcrDraft(before);
            editor.setValue('server', '紫禁城');
            editor.addAssist('life');
            const pet = {
                name: '',
                level: 120,
                joinLevel: 145,
                quality: { attack: 0, defense: 0, hp: 0, mp: 0, speed: 0, dodge: 0 },
                life: 0,
                growth: '',
                element: '',
                attrs: [{ label: '', value: '1500' }],
                skills: ['连击'],
                innerPills: [],
            };
            editor.draft.value.pets.push(pet);
            editor.recognize(panel, 'shot-1');
            if (panel.pane === 'attrs') {
                expect(editor.draft.value.attrGroups[0].rows[0].value).toBe('1000');
            } else if (panel.pane === 'skills') {
                expect(editor.draft.value.skills[0].level).toBe(150);
            } else if (panel.pane === 'assist') {
                expect(editor.draft.value.assists).toContainEqual({
                    name: '变化之术',
                    kind: 'story',
                    level: 6,
                });
            } else {
                expect(editor.draft.value.trainings[0].rows[0].level).toBe(12);
            }
            expect(editor.draft.value.server).toBe('紫禁城');
            expect(editor.draft.value.pets).toEqual([pet]);
            expect(editor.draft.value.assists).toContainEqual({
                name: '',
                kind: 'life',
                level: 0,
            });
            editor.draft.value.pets[0].name = '草稿兽';
            editor.setAssist(0, { name: '强身术', level: 98 });
            const saved = normalizeCharacter(editor.draft.value);
            expect(saved.pets[0]).toMatchObject({ name: '草稿兽', level: 120, skills: ['连击'] });
            expect(saved.assists[0].level).toBe(98);
            expect(before).toEqual(character());
        }
    });

    it('辅助可新增、改名、改等级和删空，删除也能单独保存', () => {
        const before = character();
        before.assists = [{ name: '强身术', kind: 'life', level: 98 }];
        const editor = useOcrDraft(before);
        editor.addAssist('story');
        editor.setAssist(1, { name: '变化之术', level: 6 });
        expect(editor.draft.value.assists[1]).toEqual({
            name: '变化之术',
            kind: 'story',
            level: 6,
        });
        editor.removeAssist(0);
        editor.removeAssist(0);
        expect(editor.draft.value.assists).toEqual([]);
        expect(editor.changed.value).toBe(true);
        expect(before.assists).toHaveLength(1);
    });

    it('师门和修炼可补录及清空等级，自定义修炼上限保留', () => {
        const before = character();
        before.trainings[0].rows[0].cap = 25;
        const editor = useOcrDraft(before);
        const skill = editor.draft.value.skills[0].name;
        const training = editor.draft.value.trainings[0].rows[0].name;
        editor.setSkill(skill, 150);
        editor.setTraining(training, 12);
        editor.setSkill(skill, 0);
        editor.setTraining(training, 0);
        expect(editor.draft.value.skills[0].level).toBe(0);
        expect(editor.draft.value.trainings[0].rows[0]).toMatchObject({ level: 0, cap: 25 });
        editor.setValue('school', '大唐官府');
        expect(editor.draft.value.skills).toHaveLength(7);
        expect(editor.draft.value.skills.some((row) => row.name === skill)).toBe(false);
    });
});
