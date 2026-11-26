import { activeAppShell } from './services/app-shell';

if (activeAppShell === 'legacy') {
    void import('./main');
} else {
    void import('./liquid-main');
}
