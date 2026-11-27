import { onMounted, ref } from 'vue';
import { askConfirm, type ConfirmOptions } from '../../composables/use-confirm';
import { useDraftGuard } from '../../composables/use-draft-guard';
import type { DataOutcome } from '../../services/data-files';
import { reloadWithDataNotice, takeDataNotice, truncationNote } from './data-notice';

export function useLedgerOperations() {
    const busy = ref(false);
    const message = ref('');
    const warning = ref('');
    const messageKind = ref<'error' | 'positive'>('positive');

    useDraftGuard(
        () => false,
        () => busy.value,
        () => {},
    );

    async function run(
        action: () => Promise<DataOutcome>,
        options: { confirm?: ConfirmOptions; reload?: boolean } = {},
    ) {
        if (busy.value) return;
        busy.value = true;
        let reloading = false;
        try {
            if (options.confirm && !(await askConfirm(options.confirm))) return;
            const outcome = await action();
            warning.value = '';
            if (outcome.status === 'failed') {
                messageKind.value = 'error';
                message.value = outcome.error;
            } else {
                messageKind.value = 'positive';
                message.value = outcome.status === 'ok' ? outcome.detail : '';
            }
            if (outcome.status !== 'ok') return;
            warning.value = [outcome.warning, truncationNote(outcome.truncation)]
                .filter(Boolean)
                .join(' ');
            if (options.reload) {
                reloadWithDataNotice(message.value, warning.value);
                reloading = true;
            }
        } catch (error) {
            messageKind.value = 'error';
            message.value = error instanceof Error ? error.message : String(error);
            warning.value = '';
        } finally {
            if (!reloading) busy.value = false;
        }
    }

    onMounted(() => {
        const saved = takeDataNotice();
        if (!saved.text) return;
        message.value = saved.text;
        warning.value = saved.warning;
    });

    return { busy, message, messageKind, warning, run };
}
