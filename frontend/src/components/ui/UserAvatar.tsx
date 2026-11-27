import React, { useState, useEffect } from 'react';
import type { User } from '@/types';

interface UserAvatarProps {
    user?: Pick<User, 'name' | 'picture'> | null;
    size?: number;
    rounded?: 'full' | '2xl' | 'xl';
    className?: string;
}

/**
 * Unified Synced Profile Avatar:
 * Displays `user.picture` everywhere (Sidebar, Settings, Mobile Dock) with automatic
 * graceful fallback to a luminous Cobalt→Cyan initial monogram if missing or offline.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
    user,
    size = 36,
    rounded = 'full',
    className = '',
}) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [user?.picture]);

    const cleanName = (user?.name || 'S').replace(/\s*\(Dev Mode\)/i, '').trim();
    const initial = (cleanName[0] || 'S').toUpperCase();
    const radiusCls = rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl';

    const showImage = Boolean(user?.picture && !imgError);

    return (
        <div
            style={{ width: size, height: size }}
            className={`relative overflow-hidden shrink-0 flex items-center justify-center select-none ${radiusCls} ${
                showImage
                    ? 'bg-surface-container border border-on-surface/10'
                    : 'bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 text-white shadow-sm'
            } ${className}`}
        >
            {showImage ? (
                <img
                    src={user!.picture}
                    alt={cleanName}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                />
            ) : (
                <span
                    className="font-display font-extrabold leading-none"
                    style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}
                >
                    {initial}
                </span>
            )}
        </div>
    );
};

export default UserAvatar;
