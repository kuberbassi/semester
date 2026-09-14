let audioCtx: AudioContext | null = null;

interface WebkitAudioWindow extends Window {
    webkitAudioContext?: typeof AudioContext;
}

/**
 * Synthesizes a subtle, short click sound using the Web Audio API.
 * Acts as a tactile auditory fallback for browsers/platforms where physical vibration is disabled or unsupported.
 */
const playAudioClick = (duration: number = 0.03, frequency: number = 800) => {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
            if (!AudioContextClass) return;
            audioCtx = new AudioContextClass();
        }
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + duration);
        
        // Very quiet volume so it behaves like a device click sound (tactile feel)
        gainNode.gain.setValueAtTime(0.012, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration);
    } catch {
        // Fallback silently if AudioContext is blocked or unsupported
    }
};

const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');

const triggerHaptic = (pattern: number | number[], frequency: number = 800) => {
    let success = false;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            let adjustedPattern = pattern;
            if (isFirefox) {
                if (Array.isArray(pattern)) {
                    adjustedPattern = pattern.map((val, idx) => (idx % 2 === 0 ? Math.max(val, 35) : val));
                } else {
                    adjustedPattern = Math.max(pattern, 35);
                }
            } else {
                if (Array.isArray(pattern)) {
                    adjustedPattern = pattern.map((val, idx) => (idx % 2 === 0 ? Math.max(val, 25) : val));
                } else {
                    adjustedPattern = Math.max(pattern, 25);
                }
            }
            success = navigator.vibrate(adjustedPattern);
        } catch {
            success = false;
        }
    }
    
    // If vibration API returned false (not supported/permitted) or threw an error, use the audio fallback
    if (!success) {
        const durationSec = Array.isArray(pattern)
            ? pattern.reduce((a, b) => a + b, 0) / 1000
            : pattern / 1000;
        playAudioClick(Math.min(durationSec, 0.15), frequency);
    }
};

/**
 * Haptic feedback utility using the Web Vibration API.
 * Safely falls back to audio click synthesis on desktop, iOS Safari, and Firefox Mobile.
 */
export const haptics = {
    light: () => {
        triggerHaptic(10, 900);
    },
    medium: () => {
        triggerHaptic(20, 750);
    },
    heavy: () => {
        triggerHaptic(40, 600);
    },
    success: () => {
        triggerHaptic([15, 30, 15], 850);
    },
    error: () => {
        triggerHaptic([40, 60, 40], 500);
    }
};

