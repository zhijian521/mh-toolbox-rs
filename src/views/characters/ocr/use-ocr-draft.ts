import { computed, ref } from 'vue';
import { text } from '../../../services/shape';
import { normalizeLevel, normalizeSchoolLevel } from '../field-values';
import {
    findAttrRow,
    findTrainingRow,
    type AssistKind,
    type AssistSkill,
    type ReadonlyCharacter,
} from '../character';
import { normalizeCharacter, normalizeGear } from '../roster';
import { schoolSkills } from '../schools';
import { applyAttrPanel, type AttrPanelResult } from './attr-panel';
import { applyAssistPanel, type AssistPanelResult } from './assist-panel';
import { applySkillPanel, type SkillPanelResult } from './skill-panel';
import { applyTrainingPanel, type TrainingPanelResult } from './training-panel';

export type PanelResult =
    | { pane: 'attrs'; value: AttrPanelResult }
    | { pane: 'skills'; value: SkillPanelResult | null }
    | { pane: 'assist'; value: AssistPanelResult }
    | { pane: 'training'; value: TrainingPanelResult };

/** OCR 只覆盖一次草稿，之后的手工修正、补录和清空不再受识别状态限制。 */
export function useOcrDraft(character: ReadonlyCharacter) {
    const base = normalizeCharacter(character);
    base.skills = schoolSkills(base.school, base.skills);
    const draft = ref(base);
    // 各分区独立缓存比较结果；历史和更新时间不参与编辑，也不随每次输入重新遍历。
    const keys = Object.keys(base) as (keyof ReadonlyCharacter)[];
    const changes = keys
        .filter((key) => key !== 'id' && key !== 'updatedAt' && key !== 'growthHistory')
        .map((key) => {
            const original = JSON.stringify(base[key]);
            // 装备表单会补空详情与基础行，只比较真正会保存的内容。
            return computed(() => {
                const value = key === 'gear' ? normalizeGear(draft.value.gear) : draft.value[key];
                return JSON.stringify(value) !== original;
            });
        });
    const changed = computed(() => changes.some((one) => one.value));
    const applied = new Map<PanelResult['pane'], string>();

    function recognize(result: PanelResult | null, shot: string) {
        if (!result?.value || !shot || applied.get(result.pane) === shot) return;
        switch (result.pane) {
            case 'attrs': {
                const next = applyAttrPanel(draft.value, result.value.fields);
                Object.assign(draft.value, {
                    name: next.name,
                    level: next.level,
                    school: next.school,
                    guild: next.guild,
                    attrGroups: next.attrGroups,
                    experience: next.experience,
                    skills: next.skills,
                });
                break;
            }
            case 'skills':
                if (result.value) {
                    draft.value.skills = applySkillPanel(draft.value, result.value.rows).skills;
                }
                break;
            case 'assist':
                draft.value.assists = applyAssistPanel(draft.value, result.value.rows).assists;
                break;
            case 'training':
                draft.value.trainings = applyTrainingPanel(
                    draft.value,
                    result.value.rows,
                ).trainings;
                break;
        }
        applied.set(result.pane, shot);
    }

    function setValue(key: string, value: string) {
        const clean = text(value);
        if (key === 'school') {
            draft.value.school = clean;
            draft.value.skills = schoolSkills(clean, draft.value.skills);
        } else if (key === 'level') {
            draft.value.level = normalizeLevel(clean);
        } else if (key === 'name' || key === 'guild' || key === 'server') {
            draft.value[key] = clean;
        } else if (key === 'experience.value' || key === 'experience.need') {
            draft.value.experience[key === 'experience.value' ? 'value' : 'need'] = clean;
        } else {
            const row = findAttrRow(draft.value, key);
            if (row) row.value = clean;
        }
    }

    function setSkill(name: string, level: number) {
        const row = draft.value.skills.find((row) => row.name === name);
        if (row) row.level = normalizeSchoolLevel(level, row.cap);
    }

    function setAssist(index: number, patch: Partial<AssistSkill>) {
        const row = draft.value.assists[index];
        if (!row) return;
        Object.assign(row, patch);
        if (patch.level !== undefined) row.level = normalizeLevel(patch.level);
    }

    function addAssist(kind: AssistKind) {
        draft.value.assists.push({ name: '', kind, level: 0 });
    }

    function removeAssist(index: number) {
        if (index >= 0 && index < draft.value.assists.length) draft.value.assists.splice(index, 1);
    }

    function setTraining(name: string, level: number) {
        const row = findTrainingRow(draft.value, name);
        if (row) row.level = normalizeLevel(level);
    }

    return {
        draft,
        changed,
        recognize,
        setValue,
        setSkill,
        setAssist,
        addAssist,
        removeAssist,
        setTraining,
    };
}
