import { computed, ref } from 'vue';
import type { AssistKind, AssistSkill, CharacterData } from '../character';
import { normalizeCharacter } from '../roster';
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
export function useOcrDraft(character: CharacterData) {
    const base = normalizeCharacter(character);
    base.skills = schoolSkills(base.school, base.skills);
    const original = JSON.stringify(base);
    const draft = ref(normalizeCharacter(base));
    const changed = computed(() => JSON.stringify(normalizeCharacter(draft.value)) !== original);
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
        const text = value.trim();
        if (key === 'school') {
            draft.value.school = text;
            draft.value.skills = schoolSkills(text, draft.value.skills);
        } else if (key === 'level') {
            draft.value.level = Math.max(0, Math.trunc(Number(text) || 0));
        } else if (key === 'name' || key === 'guild' || key === 'server') {
            draft.value[key] = text;
        } else if (key === 'experience.value' || key === 'experience.need') {
            draft.value.experience[key === 'experience.value' ? 'value' : 'need'] = text;
        } else {
            const row = draft.value.attrGroups
                .flatMap((group) => group.rows)
                .find((row) => row.label === key);
            if (row) row.value = text;
        }
    }

    function setSkill(name: string, level: number) {
        const row = draft.value.skills.find((row) => row.name === name);
        if (row) row.level = level;
    }

    function setAssist(index: number, patch: Partial<AssistSkill>) {
        const row = draft.value.assists[index];
        if (row) Object.assign(row, patch);
    }

    function addAssist(kind: AssistKind) {
        draft.value.assists.push({ name: '', kind, level: 0 });
    }

    function removeAssist(index: number) {
        if (index >= 0 && index < draft.value.assists.length) draft.value.assists.splice(index, 1);
    }

    function setTraining(name: string, level: number) {
        const row = draft.value.trainings
            .flatMap((group) => group.rows)
            .find((row) => row.name === name);
        if (row) row.level = level;
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
