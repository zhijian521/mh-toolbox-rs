import { loadEquipmentNames } from '../../../services/game-data';
import { ocrFrame } from '../../../services/ocr';
import type { PaneKey } from '../character';
import { schoolSkillNames } from '../schools';
import { parseAttrPanel, type OcrLine } from './attr-panel';
import { createAssistReader } from './assist-reader';
import { gearFrame } from './gear-image';
import { recognizeGearPanel } from './gear-recognition';
import type { GearPanelResult } from './gear-panel';
import { JADE_TITLE_PATTERN } from './jade-panels';
import { recognizePetPanel } from './pet-recognition';
import type { PetPanelResult } from './pet-panel';
import { parseSkillPanel } from './skill-panel';
import { parseTrainingPanel } from './training-panel';
import type { PanelResult } from './use-ocr-draft';

export type CharacterPanelResult =
    | PanelResult
    | { pane: 'gear'; value: GearPanelResult }
    | { pane: 'pets'; value: PetPanelResult };

/** 先排除与角色同名的装备、召唤兽属性，再比较文本分区；图标识别仅在文本不足时运行。 */
export function createCharacterPanelReader() {
    const readAssist = createAssistReader();
    return async (
        lines: OcrLine[],
        image: ImageData,
        school: string,
        preferred: PaneKey,
        readText?: () => Promise<OcrLine[]>,
    ): Promise<CharacterPanelResult | null> => {
        // 辅助页仍先走图标与等级小图；只有传入其他面板时才读取整图。
        if (preferred === 'assist' && readText) {
            const assist = await readAssist(image);
            if (assist.hit) return { pane: 'assist', value: assist };
            lines = await readText();
        }
        const text = lines.map((line) => line.text.replace(/\s/g, '')).join('\n');
        const pet = /召唤兽(?:属性|资质)|(?:攻击|防御|体力|法力|速度|躲闪)资质|参战等级|寿命/.test(
            text,
        );
        const gear =
            JADE_TITLE_PATTERN.test(text) ||
            /装备条件|灵饰类型|命魂之玉|耐久|锻炼等级|精炼等级|灵尘等级|镶嵌宝石/.test(text);
        // 同时包含两种面板时不猜，避免把召唤兽读数写进人物或装备。
        if (pet && gear) return null;
        if (pet) {
            const value = await recognizePetPanel(lines, image);
            return value.hit ? { pane: 'pets', value } : null;
        }
        if (gear) {
            const frame = gearFrame(image);
            const outcome = await ocrFrame(frame.pixels, frame.width, frame.height);
            if (outcome.status === 'failed') throw new Error(outcome.error);
            const value = await recognizeGearPanel(
                outcome.lines,
                image,
                await loadEquipmentNames(),
            );
            return value.slot && value.hit ? { pane: 'gear', value } : null;
        }

        const candidates: PanelResult[] = [
            { pane: 'attrs', value: parseAttrPanel(lines) },
            { pane: 'training', value: parseTrainingPanel(lines) },
        ];
        const names = schoolSkillNames(school);
        if (names?.length)
            candidates.push({ pane: 'skills', value: parseSkillPanel(lines, names) });
        const best = candidates.reduce<PanelResult | null>((selected, candidate) => {
            const hit = candidate.value?.hit ?? 0;
            const previous = selected?.value?.hit ?? 0;
            return hit > previous || (hit > 0 && hit === previous && candidate.pane === preferred)
                ? candidate
                : selected;
        }, null);
        if ((best?.value?.hit ?? 0) >= 2) return best;
        const assist = await readAssist(image);
        return assist.hit > (best?.value?.hit ?? 0) ? { pane: 'assist', value: assist } : best;
    };
}
