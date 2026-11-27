import React from 'react';
import { openExternalUrl } from '@/services/desktopDb';

interface ExternalLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    href: string;
}

/** Anchor that always opens in the system browser / mail client (desktop) or a new tab (web). */
const ExternalLink: React.FC<ExternalLinkProps> = ({ href, children, onClick, ...rest }) => (
    <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
            onClick?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            void openExternalUrl(href).catch(() => undefined);
        }}
    >
        {children}
    </a>
);

export default ExternalLink;
