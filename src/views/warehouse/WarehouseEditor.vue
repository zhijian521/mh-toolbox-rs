<script setup lang="ts">
/** 物品编辑独立于角色；账号与角色入口共享相同草稿和截图识别流程。 */
import { computed, ref } from 'vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useDraftGuard } from '../../composables/use-draft-guard';
import { usePersistedSubmit } from '../../composables/use-persisted-submit';
import { askConfirm } from '../../composables/use-confirm';
import { notify } from '../../composables/use-notify';
import { GEAR_SLOTS, hasGearDetail } from '../characters/gear';
import { hasPetName } from '../characters/pets';
import GearDetailForm from '../characters/editor/GearDetailForm.vue';
import PetDetailForm from '../characters/editor/PetDetailForm.vue';
import GearScreenshot from '../characters/ocr/GearScreenshot.vue';
import PetScreenshot from '../characters/ocr/PetScreenshot.vue';
import OcrSummary from '../characters/ocr/OcrSummary.vue';
import {
    changeReport,
    gearReview,
    gearSnapshot,
    petReview,
    petSnapshot,
    type OcrReport,
} from '../characters/ocr/change-summary';
import type { GearPanelResult } from '../characters/ocr/gear-panel';
import { applyPetPanel, type PetPanelResult } from '../characters/ocr/pet-panel';
import { cloneDraft } from '../characters/quick/clone-draft';
import { normalizeGearDetail } from '../characters/details';
import {
    recognizeWarehouseGear,
    warehouseName,
    type ReadonlyWarehouseItem,
    type WarehouseGear,
    type WarehouseItem,
} from './warehouse';
import { useWarehouse } from './warehouse-store';

const props = defineProps<{ item: ReadonlyWarehouseItem; existing: boolean }>();
const emit = defineEmits<{ close: []; saved: []; removed: [] }>();
const store = useWarehouse();
store.operationError.value = '';
const { operationError, writeError } = store;
const submission = usePersistedSubmit(store.flush, store.retry);
const { saving, locked, action } = submission;
const confirming = ref(false);
const departed = ref(false);
const drafts = ref<WarehouseItem[]>([cloneDraft<WarehouseItem>(props.item)]);
const index = ref('0');
const active = computed(() => drafts.value[Number(index.value)]!);
const reading = ref(false);
const reports = ref<OcrReport[]>([]);
const snapshot = () =>
    JSON.stringify(
        drafts.value.map((item) =>
            item.kind === 'gear'
                ? { ...item, gear: { ...item.gear, detail: normalizeGearDetail(item.gear.detail) } }
                : item,
        ),
    );
const original = snapshot();
const expected = props.existing ? JSON.stringify(props.item) : undefined;
const { requestClose } = useDraftGuard(
    () => !departed.value && action.value === null && (reading.value || snapshot() !== original),
    () => saving.value || confirming.value,
    () => {
        departed.value = true;
        emit('close');
    },
);
defineExpose({ requestClose });
const slotOptions = computed(() => GEAR_SLOTS.map((value) => ({ value, label: value })));
const choices = computed(() =>
    drafts.value.map((item, i) => ({ value: String(i), label: warehouseName(item) })),
);
const canSave = computed(
    () =>
        !reading.value &&
        !saving.value &&
        !confirming.value &&
        action.value !== 'remove' &&
        drafts.value.every((item) =>
            item.kind === 'pet' ? hasPetName(item.pet) : hasGearDetail(item.gear.detail),
        ),
);
const saveText = computed(() => {
    if (saving.value) return '保存中';
    if (action.value === 'save') return '重试保存';
    if (props.existing) return '保存修改';
    return drafts.value.length > 1 ? '全部入仓' : '保存入仓';
});
const canRemove = computed(
    () =>
        props.existing &&
        !reading.value &&
        !saving.value &&
        !confirming.value &&
        !store.loadError.value &&
        (action.value === 'remove' ||
            (action.value === null && !writeError.value && !store.pending.value)),
);

function recognizeGear(result: GearPanelResult) {
    const item = active.value;
    if (locked.value || item.kind !== 'gear') return;
    const companions = drafts.value.filter(
        (one): one is WarehouseGear => one.kind === 'gear' && one.id !== item.id,
    );
    const next = recognizeWarehouseGear(item, result, companions);
    reports.value = next.map((asset) => {
        const before = drafts.value.find((one) => one.id === asset.id);
        return changeReport(
            asset.gear.slot,
            before?.kind === 'gear' ? gearSnapshot(before.gear.detail, before.gear.slot) : {},
            gearSnapshot(asset.gear.detail, asset.gear.slot),
            gearReview(result),
            next.length > 1
                ? `同图识别 ${next.length} 件，将一起入仓；保存前可逐件核对。`
                : '识别已覆盖当前草稿，保存后生效。',
        );
    });
    const byId = new Map(next.map((one) => [one.id, one]));
    const existingIds = new Set(drafts.value.map((one) => one.id));
    drafts.value = [
        ...drafts.value.map((one) => byId.get(one.id) ?? one),
        ...next.filter((one) => !existingIds.has(one.id)),
    ];
}
function recognizePet(result: PetPanelResult) {
    const item = active.value;
    if (locked.value || item.kind !== 'pet') return;
    const before = petSnapshot(item.pet);
    item.pet = applyPetPanel(item.pet, result);
    reports.value = [
        changeReport(
            '召唤兽',
            before,
            petSnapshot(item.pet),
            petReview(result),
            '识别已覆盖当前草稿，保存后生效。',
        ),
    ];
}
function busy(value: boolean) {
    reading.value = value;
    if (value) reports.value = [];
}
async function save() {
    if (!canSave.value || (locked.value && action.value === null)) return;
    const ok = await submission.run('save', () => store.save(drafts.value, expected));
    if (ok) {
        notify.success(props.existing ? '已保存仓库物品' : `已入仓 ${drafts.value.length} 件物品`);
        departed.value = true;
        emit('saved');
    }
}
async function remove() {
    if (!canRemove.value) return;
    if (action.value !== 'remove') {
        confirming.value = true;
        let confirmed = false;
        try {
            confirmed = await askConfirm({
                title: `删除${warehouseName(props.item)}？`,
                note: '这件物品的资料及未保存的修改将从仓库移除。',
                danger: true,
                confirmText: '删除',
            });
        } finally {
            confirming.value = false;
        }
        if (!confirmed || !canRemove.value) return;
    }
    const ok = await submission.run('remove', () => {
        const current = store.items.value.find((item) => item.id === props.item.id);
        if (JSON.stringify(current) !== expected) {
            operationError.value = '这件物品已被修改或删除，请返回仓库重新打开';
            return false;
        }
        return store.remove(props.item.id);
    });
    if (ok) {
        notify.success('已删除仓库物品');
        departed.value = true;
        emit('removed');
    }
}
</script>

<template>
    <section class="warehouse-page warehouse-editor-page">
        <div class="warehouse-page-body">
            <div class="warehouse-edit-meta" :inert="locked || reading || confirming">
                <SelectField
                    v-if="active.kind === 'gear' && !existing"
                    v-model="active.gear.slot"
                    :options="slotOptions"
                    label="装备部位"
                    class="warehouse-slot"
                />
                <span v-else class="tag">{{ active.kind === 'gear' ? active.gear.slot : '召唤兽' }}</span>
                <label class="warehouse-server">
                    <span class="muted">区服</span>
                    <input v-model="active.server" class="field" aria-label="物品区服" placeholder="选填" />
                </label>
                <span class="warehouse-edit-hint muted">截图识别后核对，保存入仓</span>
            </div>
            <SegmentedPills
                v-if="drafts.length > 1"
                v-model="index"
                :options="choices"
                :disabled="reading || locked || confirming"
                label="核对同图物品"
            />
            <div class="warehouse-edit-content" :inert="locked || confirming">
                <GearScreenshot
                    v-if="active.kind === 'gear'"
                    :key="active.id"
                    :slot-name="existing && index === '0' ? active.gear.slot : undefined"
                    :active-slot="active.gear.slot"
                    @recognize="recognizeGear"
                    @busy="busy"
                >
                    <GearDetailForm
                        :key="active.id + active.gear.slot"
                        v-model="active.gear.detail"
                        v-model:caption="active.gear.caption"
                        v-model:soul="active.soul"
                        :slot-name="active.gear.slot"
                    />
                </GearScreenshot>
                <PetScreenshot v-else :key="active.id" @recognize="recognizePet" @busy="busy">
                    <PetDetailForm v-model="active.pet" />
                </PetScreenshot>
            </div>
            <OcrSummary :reports="reports" />
        </div>
        <footer class="modal-actions">
            <PressButton
                v-if="existing"
                class="warehouse-remove"
                icon="trash"
                :text="action === 'remove' ? (saving ? '删除中' : '重试删除') : '删除'"
                label="删除仓库物品"
                :disabled="!canRemove"
                @click="remove"
            />
            <p v-if="operationError || writeError" class="note error save-error" role="status">
                {{ operationError || writeError }}
            </p>
            <PressButton
                data-modal-cancel
                icon="back"
                text="返回仓库"
                label="返回仓库列表"
                :disabled="saving || confirming"
                @click="requestClose"
            />
            <PressButton
                icon="check"
                :text="saveText"
                label="保存仓库物品"
                seal
                :disabled="!canSave"
                @click="save"
            />
        </footer>
    </section>
</template>

<style scoped>
.warehouse-edit-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 16px;
    margin-bottom: 12px;
}
.warehouse-remove {
    margin-right: auto;
}
.warehouse-slot {
    /* SelectField 默认会伸展，部位短选项只占自身宽度。 */
    flex: none;
    width: calc(112px * var(--fs-scale));
}
.warehouse-slot :deep(.select-list) {
    min-width: 100%;
}
.warehouse-server {
    display: flex;
    align-items: center;
    gap: 8px;
}
.warehouse-server input {
    width: 160px;
}
.warehouse-edit-hint {
    margin-left: auto;
    font-size: var(--fs-mini);
}
.warehouse-edit-content {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    margin-top: 8px;
}
</style>
