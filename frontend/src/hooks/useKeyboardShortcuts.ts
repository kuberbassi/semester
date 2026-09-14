import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toast-context';

/**
 * Global keyboard shortcuts hook for Semester
 * 
 * Sequences:
 * - g then d: Go to Dashboard
 * - g then t: Go to Timetable
 * - g then c: Go to Calendar
 * - g then p: Go to Practicals
 * - g then s: Go to Settings
 * - g then k: Go to Courses
 * - ?: Show keyboard shortcut guide toast
 */
export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const sequenceTimer = useRef<NodeJS.Timeout | null>(null);
  const prefixPressed = useRef<boolean>(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input components
    const target = event.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.isContentEditable;

    if (isTyping) return;

    const key = event.key.toLowerCase();

    // Help shortcut: '?' (Shift + /)
    if (event.key === '?') {
      event.preventDefault();
      showToast('info', '⌨️ Navigation Shortcuts\n───────────────────\n•  g  ➔  d  :  Dashboard\n•  g  ➔  t  :  Timetable\n•  g  ➔  c  :  Calendar\n•  g  ➔  p  :  Practicals\n•  g  ➔  s  :  Settings\n•  g  ➔  k  :  Courses');
      return;
    }

    // Sequence detector: 'g' prefix
    if (key === 'g') {
      prefixPressed.current = true;
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
      sequenceTimer.current = setTimeout(() => {
        prefixPressed.current = false;
      }, 1000); // 1 second timeout
      return;
    }

    if (prefixPressed.current) {
      prefixPressed.current = false;
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);

      switch (key) {
        case 'd':
          event.preventDefault();
          navigate('/dashboard');
          showToast('info', 'Navigating to Dashboard');
          break;
        case 't':
          event.preventDefault();
          navigate('/timetable');
          showToast('info', 'Navigating to Timetable');
          break;
        case 'c':
          event.preventDefault();
          navigate('/calendar');
          showToast('info', 'Navigating to Calendar');
          break;
        case 'p':
          event.preventDefault();
          navigate('/practicals');
          showToast('info', 'Navigating to Practicals');
          break;
        case 's':
          event.preventDefault();
          navigate('/settings');
          showToast('info', 'Navigating to Settings');
          break;
        case 'k':
          event.preventDefault();
          navigate('/courses');
          showToast('info', 'Navigating to Courses');
          break;
      }
    }
  }, [navigate, showToast]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
    };
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;
