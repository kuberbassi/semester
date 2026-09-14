import { useRef, useEffect } from "react";

export function useAutoUpdate() {
    const versionRef = useRef<string | null>(null);

    useEffect(() => {
        const checkVersion = async () => {
            try {
                // Add timestamp to prevent caching of the version file itself
                const res = await fetch(`/version.json?t=${new Date().getTime()}`, {
                    cache: 'no-store'
                });
                if (!res.ok) return;

                const data = await res.json();
                const latestVersion = data.version; // e.g., "build-1738291..."

                if (versionRef.current && versionRef.current !== latestVersion) {
                    // Version mismatch! Hard reload.
                    console.log(`New version found: ${latestVersion}. Reloading...`);

                    if ('serviceWorker' in navigator) {
                        // Unregister old SWs to ensure fresh load
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (const registration of registrations) {
                            await registration.unregister();
                        }
                    }

                    // Force reload from server, ignoring cache
                    window.location.reload();
                } else {
                    versionRef.current = latestVersion;
                }
            } catch (e) {
                console.error("Failed to check version", e);
            }
        };

        // Check version immediately on mount
        checkVersion();

        // Check periodically (every 5 minutes)
        const interval = setInterval(checkVersion, 5 * 60 * 1000);

        // Check on visibility change (when user comes back to tab)
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                checkVersion();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

}
