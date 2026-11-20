import confetti from 'canvas-confetti';
import { haptics } from './haptics';

/**
 * Trigger school pride celebratory confetti ribbons
 */
export function triggerCelebration(originX = 0.5, originY = 0.6) {
    haptics.success();

    // First burst: Emerald & Gold particles
    confetti({
        particleCount: 50,
        spread: 60,
        origin: { x: originX, y: originY },
        colors: ['#10B981', '#34D399', '#F59E0B', '#FBBF24', '#8B5CF6'],
        ticks: 200,
        gravity: 1.1,
        scalar: 1.1,
    });

    // Secondary delayed burst: Stars & metallic confetti
    setTimeout(() => {
        confetti({
            particleCount: 35,
            angle: 60,
            spread: 55,
            origin: { x: originX - 0.1, y: originY },
            colors: ['#10B981', '#6EE7B7', '#FFFFFF'],
        });
        confetti({
            particleCount: 35,
            angle: 120,
            spread: 55,
            origin: { x: originX + 0.1, y: originY },
            colors: ['#F59E0B', '#FCD34D', '#FFFFFF'],
        });
    }, 180);
}

/**
 * 100% Milestone Cannon (All practicals or perfect attendance)
 */
export function triggerPerfectScoreCelebration() {
    haptics.heavy();

    const duration = 2.5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const interval: ReturnType<typeof setInterval> = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
            return clearInterval(interval);
        }
        const particleCount = 40 * (timeLeft / duration);
        confetti({
            ...defaults,
            particleCount,
            origin: { x: Math.random(), y: Math.random() - 0.2 },
            colors: ['#10B981', '#F59E0B', '#8B5CF6', '#3B82F6'],
        });
    }, 250);
}
