import { useEffect } from 'react';

interface PageMeta {
    title: string;
    description: string;
    /** Set to true for public/indexable pages, false (default) adds noindex */
    indexable?: boolean;
}

/**
 * Lightweight per-page meta updater.
 * Sets document.title, description, and robots noindex for protected pages.
 */
export function usePageMeta({ title, description, indexable = false }: PageMeta) {
    useEffect(() => {
        // Title
        document.title = title;

        // Description
        let descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        if (!descEl) {
            descEl = document.createElement('meta');
            descEl.name = 'description';
            document.head.appendChild(descEl);
        }
        descEl.content = description;

        // Robots
        let robotsEl = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
        if (!robotsEl) {
            robotsEl = document.createElement('meta');
            robotsEl.name = 'robots';
            document.head.appendChild(robotsEl);
        }
        robotsEl.content = indexable ? 'index, follow' : 'noindex, nofollow';

        // OG title
        const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = title;

        // OG description
        const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = description;

        return () => {
            // Restore defaults on unmount
            document.title = 'Semester | Student Center';
        };
    }, [title, description, indexable]);
}
