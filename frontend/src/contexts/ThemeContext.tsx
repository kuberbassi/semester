import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const saved = localStorage.getItem('zenith_theme');
        if (saved === 'light' || saved === 'dark') return saved;
        return 'light';
    });

    const [accentColor, setAccentColorState] = useState(() => {
        return theme === 'dark' ? '#ecece9' : '#1d1c1a';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.remove('light');
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
            root.classList.add('light');
        }
        localStorage.setItem('zenith_theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        setThemeState(nextTheme);
        setAccentColorState(nextTheme === 'dark' ? '#ecece9' : '#1d1c1a');
    }, [theme]);

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t);
        setAccentColorState(t === 'dark' ? '#ecece9' : '#1d1c1a');
    }, []);

    const setAccentColor = useCallback((color: string) => {
        setAccentColorState(color);
    }, []);

    const value: ThemeContextValue = {
        theme,
        toggleTheme,
        setTheme,
        accentColor,
        setAccentColor
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
