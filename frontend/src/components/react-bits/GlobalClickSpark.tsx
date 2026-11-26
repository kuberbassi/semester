import React, { useRef, useEffect } from 'react';

interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    decay: number;
    color: string;
}

export const GlobalClickSpark: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sparksRef = useRef<Spark[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;

        // Resize canvas to window dimensions
        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        // Vibrant Framer neon color palette
        const colors = [
            '#00f0ff', // electric cyan
            '#3b82f6', // sapphire blue
            '#8b5cf6', // luminous purple
            '#10b981', // emerald green
            '#f43f5e', // neon rose
            '#ffffff', // pure spark white
        ];

        // Trigger sparks on pointerdown (handles mouse clicks, finger taps, pen)
        const handlePointerDown = (e: PointerEvent) => {
            const count = 9;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
                const speed = 2.2 + Math.random() * 3.5;
                sparksRef.current.push({
                    x: e.clientX,
                    y: e.clientY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 3 + Math.random() * 3.5,
                    alpha: 1,
                    decay: 0.024 + Math.random() * 0.016,
                    color: colors[Math.floor(Math.random() * colors.length)],
                });
            }
        };

        window.addEventListener('pointerdown', handlePointerDown, { passive: true });

        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            sparksRef.current = sparksRef.current.filter((s) => s.alpha > 0);

            for (const s of sparksRef.current) {
                s.x += s.vx;
                s.y += s.vy;
                s.vx *= 0.94; // slight drag
                s.vy *= 0.94;
                s.alpha -= s.decay;

                ctx.save();
                ctx.globalAlpha = Math.max(0, s.alpha);
                ctx.fillStyle = s.color;
                ctx.shadowColor = s.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(s.x, s.y, Math.max(0.5, s.size * s.alpha), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            animId = requestAnimationFrame(animate);
        };

        animId = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('pointerdown', handlePointerDown);
            cancelAnimationFrame(animId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[999999]"
            style={{ width: '100vw', height: '100vh' }}
        />
    );
};
