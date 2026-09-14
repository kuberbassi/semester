import React, { useEffect, useRef, useState } from 'react';
import { Shield, Monitor, Smartphone, RefreshCw, LogOut, CheckCircle } from 'lucide-react';
import Loader from '@/components/ui/Loader';
import { authService } from '@/services/auth.service';
import { useConfirm } from '@/contexts/confirm-context';

interface Session {
  id: string;
  ip: string;
  country_code?: string | null;
  user_agent: string;
  refresh_issued_at: number;
  last_active_at: number;
  is_current: boolean;
}

interface SessionsSectionProps {
  showToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

const SessionsSection: React.FC<SessionsSectionProps> = ({ showToast }) => {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    let active = true;
    const loadSessions = async () => {
      try {
        const data = await authService.getActiveSessions();
        if (active) setSessions(data || []);
      } catch (err) {
        console.error(err);
        if (active) showToastRef.current('error', 'Failed to load active sessions');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSessions();
    return () => { active = false; };
  }, []);

  const handleRevoke = async (id: string, name: string) => {
    const isConfirmed = await confirm({
      title: 'Terminate Session',
      message: `Are you sure you want to terminate the session on ${name}?`,
    });
    if (!isConfirmed) return;
    setRevokingId(id);
    try {
      await authService.revokeSession(id);
      showToast('success', `Session terminated on ${name}`);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to terminate session');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    const isConfirmed = await confirm({
      title: 'Terminate Other Sessions',
      message: 'Are you sure you want to terminate all other sessions? This will log out all other devices.',
    });
    if (!isConfirmed) return;
    setRevokingAll(true);
    try {
      await authService.revokeOtherSessions();
      showToast('success', 'All other sessions terminated');
      setSessions(prev => prev.filter(s => s.is_current));
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to terminate other sessions');
    } finally {
      setRevokingAll(false);
    }
  };

  const getDeviceDetails = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    let os = 'Unknown OS';
    let isMobile = false;

    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) {
      os = 'Android';
      isMobile = true;
    } else if (ua.includes('iphone') || ua.includes('ipad')) {
      os = 'iOS';
      isMobile = true;
    }

    let browser = 'Unknown Browser';
    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';

    return { os, browser, isMobile };
  };

  const getDeviceIcon = (userAgent: string) => {
    const { isMobile } = getDeviceDetails(userAgent);
    if (isMobile) {
      return <Smartphone size={18} className="text-on-surface-variant" />;
    }
    return <Monitor size={18} className="text-on-surface-variant" />;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  const formatCountry = (code?: string | null) => {
    if (code === 'LOCAL') return 'Local device';
    if (!code) return 'Country unknown';
    try {
      return new Intl.DisplayNames([navigator.language], { type: 'region' }).of(code) || code;
    } catch {
      return code;
    }
  };

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center">
        <Loader size={20} />
      </div>
    );
  }

  const otherSessionsCount = sessions.filter(s => !s.is_current).length;

  return (
    <div className="space-y-6">
      {/* Sessions Container */}
      <div className="border border-outline rounded-xl overflow-hidden bg-surface">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-outline bg-surface-container/50">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield size={14} className="text-on-surface-variant/50 shrink-0" />
            <span className="text-xs font-semibold text-on-surface">Logged-in Devices</span>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border border-outline text-on-surface-variant/50 bg-surface ml-0 sm:ml-1.5 shrink-0">
              {sessions.length} Active
            </span>
          </div>
          {otherSessionsCount > 0 && (
            <button
              onClick={handleRevokeOthers}
              disabled={revokingAll}
              className="h-7 px-3 text-[10px] font-semibold uppercase tracking-wider rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/5 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto justify-center"
            >
              {revokingAll ? (
                <RefreshCw size={10} className="animate-spin" />
              ) : (
                <LogOut size={10} />
              )}
              Log out other devices
            </button>
          )}
        </div>

        <div className="divide-y divide-outline/30">
          {sessions.map(session => {
            const { os, browser } = getDeviceDetails(session.user_agent);
            const deviceName = `${os} • ${browser}`;

            return (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 p-5 hover:bg-surface-container/10 transition-colors"
              >
                <div className="flex gap-3.5 items-center min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-surface-container border border-outline/65 flex items-center justify-center shrink-0">
                    {getDeviceIcon(session.user_agent)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2 mb-0.5">
                      <h4 className="text-xs font-bold text-on-surface truncate">
                        {deviceName}
                      </h4>
                      {session.is_current && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[8px] font-bold text-primary uppercase tracking-wider flex items-center gap-0.5 leading-none">
                          <CheckCircle size={8} /> Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant/60 font-medium flex flex-wrap gap-x-2.5 gap-y-1">
                      <span>IP: {session.ip}</span>
                      <span className="text-on-surface-variant/20">•</span>
                      <span>{formatCountry(session.country_code)}</span>
                      <span className="text-on-surface-variant/20">•</span>
                      <span>{session.is_current ? 'Active now' : `Last verified: ${formatDate(session.last_active_at)}`}</span>
                    </p>
                  </div>
                </div>

                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.id, deviceName)}
                    disabled={revokingId === session.id}
                    className="shrink-0 h-7 px-3 border border-outline hover:bg-surface-container rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-on-surface transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {revokingId === session.id ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      'Terminate'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SessionsSection;
