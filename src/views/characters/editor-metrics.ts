/**
 * 角色相关弹窗的共用尺寸。
 *
 * 860 不是随手写的数：它由「左栏 400 + 右栏卡宽 `--char-w` + 描边 / 内边距 / gap」
 * 反推而来，算式写在 `CharacterEditor.vue` 的样式注释里。2026-11-10 卡宽在
 * 450 → 420 → 400 → 420 之间来回改时，这里是最容易漏的地方——三个弹窗**从不并排出现**，
 * 改漏一个肉眼看不出来。改卡宽时先看这里，别在三处各改一遍。
 *
 * 两个常量分两档：
 * - `EDITOR_W` 给数字（`ModalShell` 按 px 处理）；
 * - `EDITOR_MIN_H` 给整段 CSS 值（要跟着视口走，`ModalShell` 原样交出去）。
 *
 * 「定高」与「下限」**不能统一**：`CharacterEditor` 传 `height`（切分区时尺寸不跳），
 * 两个快速修改窗传 `min-height`（内容长了跟着长）。`ModalShell.vue` 对两者分开处理。
 */
export const EDITOR_W = 860;
export const EDITOR_MIN_H = 'min(740px, calc(100vh - 48px))';
