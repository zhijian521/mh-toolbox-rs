import { computed, nextTick, onBeforeUnmount, ref, shallowReactive, type Ref } from 'vue';
import { ocrFrame, scheduleOcr } from '../../../services/ocr';
import { PANES, type PaneKey, type ReadonlyCharacter } from '../character';
import { normalizeGear } from '../roster';
import type { OcrLine } from './attr-panel';
import { createCharacterPanelReader, type CharacterPanelResult } from './character-panel';
import type { GearPanelResult } from './gear-panel';
import { base64Of, swapToBgra } from './pixels';
import { emptyPet } from './pet-panel';
import { useOcrImage } from './use-ocr-image';
import {
    characterSnapshot,
    changeReport,
    panelReview,
    gearReview,
    petReview,
    REPLACE_NOTE,
    type OcrReport,
} from './change-summary';

type StandardPane = Exclude<PaneKey, 'gear' | 'pets'>;
interface ScreenshotPreview {
    url: string;
    lines: OcrLine[];
    hit: number;
    total: number;
}

function standardPane(pane: PaneKey): pane is StandardPane {
    return pane !== 'gear' && pane !== 'pets';
}

function paneDraft(character: ReadonlyCharacter, pane: PaneKey): string {
    const { name, level, school, guild, skills, experience, attrGroups } = character;
    switch (pane) {
        case 'attrs':
            return JSON.stringify([name, level, school, guild, skills, experience, attrGroups]);
        case 'skills':
            return JSON.stringify([school, skills]);
        case 'assist':
            return JSON.stringify(character.assists);
        case 'training':
            return JSON.stringify(character.trainings);
        case 'gear':
            return JSON.stringify([normalizeGear(character.gear), character.gearMeta]);
        case 'pets':
            return JSON.stringify(character.pets);
    }
}

export function useCharacterScreenshots(
    pane: Ref<PaneKey>,
    draft: Readonly<Ref<ReadonlyCharacter>>,
    apply: (file: File, panel: CharacterPanelResult, lines: OcrLine[], shot: string) => void,
) {
    const previews = shallowReactive(new Map<StandardPane, ScreenshotPreview>());
    const preview = computed(() =>
        standardPane(pane.value) ? previews.get(pane.value) : undefined,
    );
    const reports = ref<OcrReport[]>([]);
    const feedback = ref('');
    const queued = ref(false);
    let generation = 0;
    let disposed = false;
    let readingPane = pane.value;
    let showGearPreview: ((result: GearPanelResult) => void) | undefined;
    const readPanel = createCharacterPanelReader();
    const { result, rawLines, shotUrl, busy, error, takeFile } =
        useOcrImage<CharacterPanelResult | null>(
            async (lines, image) => {
                const version = generation;
                const preferred = readingPane;
                const current = () => !disposed && version === generation;
                const readText = async () => {
                    const outcome = await scheduleOcr(
                        () => ocrFrame(base64Of(swapToBgra(image.data)), image.width, image.height),
                        current,
                    );
                    if (!outcome || !current()) return [];
                    if (outcome.status === 'failed') throw new Error(outcome.error);
                    rawLines.value = outcome.lines;
                    return outcome.lines;
                };
                const result = await readPanel(
                    lines,
                    image,
                    draft.value.school,
                    preferred,
                    preferred === 'assist' ? readText : undefined,
                    showGearPreview,
                );
                return { result, error: result ? '' : '没认出可填写的内容，请截取完整的面板' };
            },
            undefined,
            () => readingPane !== 'assist',
        );

    function remember(target: StandardPane, file: File, panel?: CharacterPanelResult) {
        const previous = previews.get(target);
        const value = panel?.value;
        previews.set(target, {
            url: URL.createObjectURL(file),
            lines: rawLines.value,
            hit: value?.hit ?? 0,
            total: value && 'total' in value ? value.total : (value?.hit ?? 0),
        });
        if (previous) URL.revokeObjectURL(previous.url);
    }

    async function takeFiles(files: File[]) {
        if (disposed || !files.length) return;
        const version = ++generation;
        const current = () => !disposed && version === generation;
        const drafts = new Map(PANES.map(({ key }) => [key, paneDraft(draft.value, key)]));
        const unchanged = (key: PaneKey) => paneDraft(draft.value, key) === drafts.get(key);
        queued.value = true;
        feedback.value = '';
        reports.value = [];
        const failures: string[] = [];
        try {
            for (const file of files) {
                if (!current()) return;
                const startPane = pane.value;
                readingPane = startPane;
                let gearBefore: ReturnType<typeof characterSnapshot> | undefined;
                showGearPreview = (value) => {
                    if (!current() || pane.value !== 'gear' || !unchanged('gear')) return;
                    gearBefore = characterSnapshot(draft.value, 'gear');
                    apply(file, { pane: 'gear', value }, rawLines.value, shotUrl.value);
                    drafts.set('gear', paneDraft(draft.value, 'gear'));
                };
                await takeFile(file);
                if (!current()) return;
                const panel = result.value;
                if (!panel || error.value) {
                    if (shotUrl.value && standardPane(startPane)) remember(startPane, file);
                    failures.push(`${file.name}：${error.value || '未识别'}`);
                    continue;
                }
                const target = panel.pane;
                if (standardPane(target)) remember(target, file, panel);
                if (!unchanged(target)) {
                    failures.push(`${file.name}：此分区已有手工修改，已保留草稿`);
                    continue;
                }
                pane.value = target;
                if (!standardPane(target)) {
                    // 草稿保护在切页前检查。装备编辑器挂载时会补默认字段。
                    await nextTick();
                    if (!current()) return;
                }
                const character = draft.value;
                const before =
                    gearBefore ??
                    characterSnapshot(
                        target === 'pets' && !character.pets.length
                            ? { ...character, pets: [{ ...emptyPet(), name: '' }] }
                            : character,
                        target,
                    );
                const attrsUnchanged = target === 'skills' && unchanged('attrs');
                apply(file, panel, rawLines.value, shotUrl.value);
                // 同一批的后续图片可以继续覆盖本批回填，手工修改仍会被检测到。
                drafts.set(target, paneDraft(draft.value, target));
                if (target === 'attrs') drafts.set('skills', paneDraft(draft.value, 'skills'));
                if (attrsUnchanged) drafts.set('attrs', paneDraft(draft.value, 'attrs'));
                const review =
                    panel.pane === 'gear'
                        ? gearReview(panel.value)
                        : panel.pane === 'pets'
                          ? petReview(panel.value)
                          : panelReview(panel);
                reports.value.push(
                    changeReport(
                        `${file.name} · ${PANES.find(({ key }) => key === target)?.label ?? ''}`,
                        before,
                        characterSnapshot(draft.value, target),
                        review,
                        standardPane(target) ? '' : REPLACE_NOTE,
                    ),
                );
            }
        } finally {
            if (current()) {
                showGearPreview = undefined;
                feedback.value = failures.join('；');
                queued.value = false;
            }
        }
    }

    onBeforeUnmount(() => {
        disposed = true;
        for (const { url } of previews.values()) URL.revokeObjectURL(url);
    });

    return {
        preview,
        reports,
        error: feedback,
        busy: computed(() => queued.value || busy.value),
        takeFiles,
    };
}
