
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceService } from '@/services/attendance.service';
import { useSemester } from '@/contexts/semester-context';
import type { DashboardData, User } from '@/types';
import axios from 'axios';
import { formatLocalDate } from '@/lib/date';
import { isTauriDesktop } from '@/utils/platform';


export const useDashboard = () => {
    const { currentSemester } = useSemester();
    const queryClient = useQueryClient();
    const desktop = isTauriDesktop();

    const query = useQuery({
        queryKey: ['dashboard', currentSemester],
        // React Query controls browser freshness. On Tauri desktop, SQLite reads
        // complete in <1ms so staleTime=0 guarantees instantaneous live metrics.
        queryFn: () => attendanceService.getDashboardData(currentSemester, true),
        staleTime: desktop ? 0 : 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
        placeholderData: (prev) =>
            prev ?? attendanceService.getDashboardLocalCache(currentSemester) ?? undefined,
    });

    const prefetchDashboard = (semester: number) => {
        queryClient.prefetchQuery({
            queryKey: ['dashboard', semester],
            queryFn: () => attendanceService.getDashboardData(semester),
        });
    };

    return { ...query, prefetchDashboard };
};

export const useMarkAttendance = () => {
    const queryClient = useQueryClient();
    const { currentSemester } = useSemester();

    return useMutation({
        mutationFn: async ({ subjectId, status }: { subjectId: string; status: 'present' | 'absent' }) => {
            await attendanceService.markAttendance(subjectId, status, formatLocalDate());
        },
        onMutate: async ({ subjectId, status }) => {
            await queryClient.cancelQueries({ queryKey: ['dashboard', currentSemester] });

            const previousData = queryClient.getQueryData<DashboardData>(['dashboard', currentSemester]);

            if (previousData) {
                queryClient.setQueryData<DashboardData>(['dashboard', currentSemester], (old) => {
                    if (!old) return old;

                    const updatedSubjects = old.subjects.map((sub) => {
                        if (sub._id === subjectId) {
                            const newAttended = status === 'present' ? (sub.attended || 0) + 1 : (sub.attended || 0);
                            const newTotal = (sub.total || 0) + 1;
                            const medicalLeaveCount = sub.medical_leave_count ?? 0;
                            const adjustedAttended = Math.max(0, newAttended - medicalLeaveCount);
                            const adjustedTotal = Math.max(0, newTotal - medicalLeaveCount);
                            const newPercentage = adjustedTotal > 0 ? (adjustedAttended / adjustedTotal) * 100 : 0;
                            const target = sub.target || (queryClient.getQueryData<User>(['user'])?.attendance_threshold || 75);
                            const newStatusMsg = newPercentage < target ? "Low Attendance" : "On Track";

                            return {
                                ...sub,
                                attended: newAttended,
                                total: newTotal,
                                attendance_percentage: newPercentage,
                                status_message: newStatusMsg,
                            };
                        }
                        return sub;
                    });

                    let totalAtt = 0;
                    let totalClasses = 0;
                    updatedSubjects.forEach(s => {
                        totalAtt += s.attended || 0;
                        totalClasses += s.total || 0;
                    });
                    const medicalLeaveCount = old.medical_leave_count ?? 0;
                    const adjustedTotal = Math.max(0, totalClasses - medicalLeaveCount);
                    const adjustedAttended = Math.max(0, totalAtt - medicalLeaveCount);
                    const newOverall = adjustedTotal > 0
                        ? (adjustedAttended / adjustedTotal * 100)
                        : 0;
                    const newWithoutMedical = totalClasses > 0
                        ? (adjustedAttended / totalClasses * 100)
                        : 0;

                    const targetThreshold = queryClient.getQueryData<User>(['user'])?.attendance_threshold || 75;
                    const newSafeBunks = adjustedTotal > 0
                        ? Math.max(0, Math.floor((adjustedAttended * 100 - targetThreshold * adjustedTotal) / targetThreshold))
                        : 0;

                    return {
                        ...old,
                        subjects: updatedSubjects,
                        overall_attendance: newOverall,
                        attendance_without_medical: newWithoutMedical,
                        summary: {
                            ...(old.summary || {}),
                            overall_percentage: newOverall,
                            total_attended: adjustedAttended,
                            total_classes: adjustedTotal,
                            safe_bunks_remaining: newSafeBunks
                        }
                    };
                });
            }

            return { previousData };
        },
        onError: (_err, _newTodo, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['dashboard', currentSemester], context.previousData);
            }
        },
        onSettled: () => {
            // Invalidate & immediately refetch active queries so local SQLite metrics snap in <5ms
            void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' });
            void queryClient.invalidateQueries({ queryKey: ['analytics'], refetchType: 'active' });
            void queryClient.invalidateQueries({ queryKey: ['calendar'], refetchType: 'active' });
            void queryClient.invalidateQueries({ queryKey: ['subjects'], refetchType: 'active' });
        },
    });
};

export const useDeleteSubject = () => {
    const queryClient = useQueryClient();
    const { currentSemester } = useSemester();

    return useMutation({
        mutationFn: async (subjectId: string) => {
            try {
                await attendanceService.deleteSubject(subjectId);
            } catch (err) {
                // 404 means the subject is already gone from DB — treat as success
                if (axios.isAxiosError(err) && err.response?.status === 404) return;
                throw err;
            }
        },
        // Optimistically remove subject from the React Query cache immediately
        onMutate: async (subjectId: string) => {
            await queryClient.cancelQueries({ queryKey: ['dashboard', currentSemester] });
            const previousData = queryClient.getQueryData<DashboardData>(['dashboard', currentSemester]);
            if (previousData) {
                queryClient.setQueryData<DashboardData>(['dashboard', currentSemester], (old) => {
                    if (!old) return old;
                    const subjects = old.subjects.filter(s => s._id !== subjectId && s.id !== subjectId);
                    return { ...old, subjects, total_subjects: subjects.length };
                });
            }
            return { previousData };
        },
        onError: (_err, _id, context) => {
            // Roll back the optimistic removal on real errors
            if (context?.previousData) {
                queryClient.setQueryData(['dashboard', currentSemester], context.previousData);
            }
        },
        onSettled: () => {
            // Force a fresh fetch from server
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['subjects'] });
        },
    });
};
