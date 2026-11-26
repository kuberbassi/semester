import React, { useRef, useEffect, useCallback } from 'react';

interface Spark {
    x: number;
    y: number;
    angle: number;
    speed: number;
    size: number;
    alpha: number;
    decay: number;
    color: string;
}

interface ClickSparkProps {
    sparkColor?: string;
    sparkSize?: number;
    sparkRadius?: number;
    sparkCount?: number;
    duration?: number;
    children?: React.ReactNode;
    className?: string;
}

export const ClickSpark: React.FC<ClickSparkProps> = ({
    sparkColor = '#34d399',
    sparkSize = 8,
    sparkRadius = 25,
    sparkCount = 8,
    duration = 450,
    children,
    className = '',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sparksRef = useRef<Spark[]>([]);

    const createSparks = useCallback((x: number, y: number) => {
        const colors = [sparkColor, '#38bdf8', '#a855f7', '#fbbf24', '#ffffff'];
        for (let i = 0; i < sparkCount; i++) {
            const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
            const speed = (sparkRadius / (duration / 16)) * (0.8 + Math.random() * 0.5);
            sparksRef.current.push({
                x,
                y,
                angle,
                speed,
                size: sparkSize * (0.6 + Math.random() * 0.8),
                alpha: 1,
                decay: 1 / (duration / 16),
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    }, [duration, sparkColor, sparkCount, sparkRadius, sparkSize]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createSparks(x, y);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;

        const update = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            sparksRef.current = sparksRef.current.filter((s) => s.alpha > 0);

            for (const spark of sparksRef.current) {
                spark.x += Math.cos(spark.angle) * spark.speed;
                spark.y += Math.sin(spark.angle) * spark.speed;
                spark.alpha -= spark.decay;

                ctx.save();
                ctx.globalAlpha = Math.max(0, spark.alpha);
                ctx.fillStyle = spark.color;
                ctx.shadowColor = spark.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(spark.x, spark.y, Math.max(0.5, spark.size * spark.alpha), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            animId = requestAnimationFrame(update);
        };

        animId = requestAnimationFrame(update);

        return () => cancelAnimationFrame(animId);
    }, []);

    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current && canvasRef.current.parentElement) {
                canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
                canvasRef.current.height = canvasRef.current.parentElement.clientHeight;
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div onClick={handleClick} className={`relative overflow-hidden ${className}`}>
            <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 z-50 h-full w-full"
            />
            {children}
        </div>
    );
};
