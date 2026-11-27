/**
 * Runtime detection for the native Tauri desktop app (Windows / macOS / Linux).
 */
export function isTauriDesktop(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return Boolean(
        '__TAURI_INTERNALS__' in win ||
        '__TAURI__' in win ||
        window.location.protocol === 'tauri:' ||
        window.location.hostname === 'tauri.localhost' ||
        window.location.hostname.endsWith('.tauri.localhost')
    );
}
