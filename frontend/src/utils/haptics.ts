let audioCtx: AudioContext | null = null;

interface WebkitAudioWindow extends Window {
    webkitAudioContext?: typeof AudioContext;
}

/**
 * Synthesizes a subtle, short click sound using the Web Audio API.
 * Acts as a tactile auditory fallback for browsers/platforms where physical vibration is disabled or unsupported.
 * Styled to feel like mechanical device detents / watch crown rotation clicks.
 */
const playAudioClick = (
    duration: number = 0.03,
    frequency: number = 800,
    volume: number = 0.012
) => {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
            if (!AudioContextClass) return;
            audioCtx = new AudioContextClass();
        }
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);
        // Exponential ramp to simulate mechanical decay
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.08), now + duration);
        
        // Attack and decay
        gainNode.gain.setValueAtTime(volume, now);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, now + duration);
        
        osc.start(now);
        osc.stop(now + duration);
    } catch {
        // Fallback silently if AudioContext is blocked or unsupported
    }
};

const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');

const triggerHaptic = (
    pattern: number | number[],
    frequency: number = 800,
    volume: number = 0.012,
    audioDuration?: number
) => {
    let success = false;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            let adjustedPattern = pattern;
            if (isFirefox) {
                if (Array.isArray(pattern)) {
                    adjustedPattern = pattern.map((val, idx) => (idx % 2 === 0 ? Math.max(val, 20) : val));
                } else {
                    adjustedPattern = Math.max(pattern, 20);
                }
            } else {
                if (Array.isArray(pattern)) {
                    adjustedPattern = pattern.map((val, idx) => (idx % 2 === 0 ? Math.max(val, 8) : val));
                } else {
                    adjustedPattern = Math.max(pattern, 6);
                }
            }
            success = navigator.vibrate(adjustedPattern);
        } catch {
            success = false;
        }
    }
    
    // If vibration API returned false (not supported/permitted) or threw an error, use the audio fallback
    if (!success) {
        const durationSec = audioDuration !== undefined
            ? audioDuration
            : Array.isArray(pattern)
                ? pattern.reduce((a, b) => a + b, 0) / 1000
                : pattern / 1000;
        playAudioClick(Math.min(durationSec, 0.15), frequency, volume);
    }
};

/**
 * Haptic feedback utility using the Web Vibration API.
 * Safely falls back to audio click synthesis on desktop, iOS Safari, and Firefox Mobile.
 */
export const haptics = {
    /**
     * Ultra-crisp micro-tick imitating an Apple Watch Digital Crown rotation detent.
     * Fires during fluid radial dragging across angular notches.
     */
    crownTick: () => {
        triggerHaptic(6, 1250, 0.006, 0.012);
    },
    /**
     * Subtle tick for drag cancellation, boundary transitions, or minor notches.
     */
    tick: () => {
        triggerHaptic(8, 1100, 0.008, 0.015);
    },
    /**
     * Light feedback for button touches or general interactions.
     */
    light: () => {
        triggerHaptic(10, 950, 0.012, 0.022);
    },
    /**
     * Distinct snap when snapping onto/highlighting a menu item during drag.
     */
    focus: () => {
        triggerHaptic(14, 900, 0.014, 0.025);
    },
    /**
     * Satisfying confirmation haptic when choosing/releasing on a page item in the bubble menu.
     */
    selection: () => {
        triggerHaptic([12, 24, 18], 820, 0.018, 0.038);
    },
    /**
     * Medium haptic for opening radial menu, long-press activations, drawers.
     */
    medium: () => {
        triggerHaptic(20, 750, 0.015, 0.035);
    },
    /**
     * Heavy haptic for destructive or high-impact actions.
     */
    heavy: () => {
        triggerHaptic(40, 600, 0.02, 0.06);
    },
    /**
     * Multi-pulse pattern for success notifications or marks.
     */
    success: () => {
        triggerHaptic([15, 30, 15], 850, 0.016, 0.04);
    },
    /**
     * Multi-pulse pattern for errors.
     */
    error: () => {
        triggerHaptic([40, 60, 40], 500, 0.02, 0.08);
    }
};
