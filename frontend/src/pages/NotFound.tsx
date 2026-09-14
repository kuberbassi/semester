import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { usePageMeta } from '@/hooks/usePageMeta';
import Button from '@/components/ui/Button';

const NotFound: React.FC = () => {
    const { isAuthenticated } = useAuth();

    usePageMeta({
        title: 'Page Not Found | Semester',
        description: 'The page you requested does not exist on Semester.',
        indexable: false,
    });

    return (
        <div className="min-h-screen bg-background text-on-background flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
            {/* Ambient Center Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-gradient-to-tr from-purple-500/10 to-indigo-500/10 dark:from-purple-500/15 dark:to-indigo-500/15 rounded-full blur-[100px] pointer-events-none z-0" />

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 max-w-md w-full text-center bg-surface/60 backdrop-blur-xl border border-outline/30 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6 select-none"
            >
                <div>
                    <span className="text-[10px] font-extrabold tracking-[0.3em] uppercase text-primary mb-2 block">
                        Error 404
                    </span>
                    <h1 className="text-4xl font-black tracking-tight text-on-surface mb-2">
                        Page Not Found
                    </h1>
                    <p className="text-xs font-semibold text-on-surface-variant/60 leading-relaxed max-w-xs mx-auto">
                        This page doesn't exist or has been moved to another path.
                    </p>
                </div>

                <div className="w-12 h-px bg-outline/20 mx-auto" />

                <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                    <Link to={isAuthenticated ? '/dashboard' : '/login'} className="w-full sm:flex-1">
                        <Button variant="filled" size="md" className="w-full justify-center shadow-lg shadow-primary/10" icon={isAuthenticated ? <Home size={14} /> : <LogIn size={14} />}>
                            {isAuthenticated ? 'Dashboard' : 'Sign In'}
                        </Button>
                    </Link>
                    <Link to="/privacy" className="w-full sm:flex-1">
                        <Button variant="outlined" size="md" className="w-full justify-center border border-outline/50 hover:bg-surface-container">
                            Privacy
                        </Button>
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};

export default NotFound;
