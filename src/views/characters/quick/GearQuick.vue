<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import GearDetailForm from '../editor/GearDetailForm.vue';
import { applyGear } from './quick-target';
import type { CharacterData, GearDetail, GearSlotName } from '../character';

/**
 * 一件装备的整份表单（快速修改的宽窗）。
 *
 * ---- 为什么它不叫「快速」了 ----
 * 名字仍沿用「快速修改」这个入口名（卡上就写着这个），但内容是**这一件的全部**：
 * 名称、类型、条件、每一条属性、状态、特殊效果、风味、制造者。第一版把它压成四格
 * （名称 / 类型 / 段数 / 宝石），用户看了一眼就说「太简单了」——那四格只够记一件
 * 白板装备，而这游戏里一件装备的价值恰恰在其余那几段。
 *
 * ---- 草稿是一份深拷贝 ----
 * 弹窗里的每一次击键都写在拷贝上，点「取消」时角色数据一个字都没动过。这也是它
 * 不能直接 `v-model` 到 `character.gear` 的原因：那等于把「编辑中」和「已保存」
 * 混成一件事，而 Esc 该是「什么都没发生」。
 */
/* prop 名不叫 `slot`：那是模板里的废弃 attribute，`:slot` 会被 `vue/no-deprecated-slot-attribute`
 * 判错（而它其实是我们的部位名）。叫 `slotName` 两边都不打架。 */
const props = defineProps<{ character: CharacterData; slotName: GearSlotName }>();
const emit = defineEmits<{ save: [character: CharacterData]; close: [] }>();

const source = computed(
    () => props.character.gear.find((one) => one.slot === props.slotName)?.detail,
);

/**
 * 深拷贝。用 JSON 而不是 `structuredClone`：这里全是纯 JSON 结构，而 JSON 这一条
 * 在任何一层宿主里都不会缺（早年的 WebView 没有 `structuredClone`）。
 */
function clone(seed: GearDetail | undefined, fallbackName: string): GearDetail {
    return seed
        ? (JSON.parse(JSON.stringify(seed)) as GearDetail)
        : { name: fallbackName, kind: '', stats: [] };
}

/* 装备名（卡上那个短名）在 `GearSlot.caption` 上，不在 `detail` 里——两处分开存是
 * 有意的（见 `applyGear` 的说明），所以这里也分开拿。 */
const caption = ref(props.character.gear.find((one) => one.slot === props.slotName)?.caption ?? '');
const detail = ref<GearDetail>(clone(source.value, caption.value));

function save() {
    emit(
        'save',
        applyGear(props.character, props.slotName, {
            caption: caption.value,
            detail: detail.value,
        }),
    );
}

/* 打开就落在装备名上（`ModalShell` 的 `none` 由调用方定位）：这一窗最常改的就是它，
 * 而 `first` 会落在「含「全名」标签旁边那个格」——名字与全名长得一样，落在哪个都
 * 说得通，不如由这里决定。 */
const form = ref<HTMLElement | null>(null);

onMounted(async () => {
    await nextTick();
    form.value?.querySelector<HTMLInputElement>('input')?.focus();
});
</script>

<template>
    <ModalShell
        :title="`快速修改 · ${props.slotName}`"
        :width="540"
        initial-focus="none"
        @close="emit('close')"
    >
        <div ref="form" class="gear-quick">
            <!-- 装备名单独一行：它既是卡上显示的那个短名，也是「这件有没有穿」的判据
                 （名称、类型都空 = 这一格回到「未装备」）。放在全名上面，主次分开。 -->
            <label class="name-row">
                <span class="field-label">装备名</span>
                <input
                    v-model="caption"
                    class="field grow"
                    :aria-label="`${props.slotName} 的装备名`"
                    placeholder="卡上显示的名字"
                />
            </label>

            <GearDetailForm v-model="detail" />

            <p class="note">名称与类型都清空，这一格就变回「未装备」。</p>
        </div>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次修改"
                @click="emit('close')"
            />
            <PressButton icon="check" text="保存" label="保存这件装备" seal @click="save" />
        </template>
    </ModalShell>
</template>

<style scoped>
/* 一列：装备名一行 + 整份表单 + 一句注脚。段距 10 比表单内部的 7 松一档——
 * 「装备名」属于外壳，与下面那八段不是一回事。 */
.gear-quick {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}
.name-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-bottom: 9px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.grow {
    flex: 1;
    min-width: 0;
}
/* 注脚居中：它是这一屏唯一一句正文，贴左会读成某个字段的注解。 */
.note {
    margin: 2px 0 0;
    text-align: center;
}
</style>
