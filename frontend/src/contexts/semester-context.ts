import { createContext, useContext } from 'react';

export interface SemesterContextValue {
    currentSemester: number;
    setCurrentSemester: (semester: number) => void;
}

export const SemesterContext = createContext<SemesterContextValue | undefined>(undefined);

export function useSemester(): SemesterContextValue {
    const context = useContext(SemesterContext);
    if (!context) {
        throw new Error('useSemester must be used within SemesterProvider');
    }
    return context;
}
