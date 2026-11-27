import React, { useState, useEffect, type ReactNode } from 'react';
import { authService } from '@/services/auth.service';
import { useAuth } from '@/contexts/auth-context';
import api from '@/services/api';
import { SemesterContext } from './semester-context';

export const SemesterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [currentSemester, setCurrentSemesterState] = useState<number>(() => {
        const saved = localStorage.getItem('zenith_semester');
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 8) return parsed;
        }
        const stored = authService.getStoredUser();
        if (stored?.semester) return stored.semester;
        if (stored?.current_semester) return stored.current_semester;
        return 5;
    });

    // Keep sidebar & pages synced when logging in or updating semester in Settings
    useEffect(() => {
        if (!user) return;
        const saved = localStorage.getItem('zenith_semester');
        const profileSem = user.current_semester || user.semester;
        if (!saved && profileSem && profileSem >= 1 && profileSem <= 8) {
            setCurrentSemesterState(profileSem);
            localStorage.setItem('zenith_semester', String(profileSem));
        }
    }, [user]);

    const setCurrentSemester = (semester: number) => {
        setCurrentSemesterState(semester);
        localStorage.setItem('zenith_semester', semester.toString());
        api.post('/api/profile/preferences', { last_semester: semester }).catch(() => {});
    };

    return (
        <SemesterContext.Provider value={{ currentSemester, setCurrentSemester }}>
            {children}
        </SemesterContext.Provider>
    );
};
