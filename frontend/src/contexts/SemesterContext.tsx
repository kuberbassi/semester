import React, { useState, type ReactNode } from 'react';
import { authService } from '@/services/auth.service';
import api from '@/services/api';
import { SemesterContext } from './semester-context';

export const SemesterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentSemester, setCurrentSemesterState] = useState<number>(() => {
        // Priority: user's manual selection in localStorage > user profile > default 1
        const saved = localStorage.getItem('zenith_semester');
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 8) return parsed;
        }
        // Fallback to user profile
        const user = authService.getStoredUser();
        if (user?.semester) return user.semester;
        if (user?.current_semester) return user.current_semester;
        return 1;
    });

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
