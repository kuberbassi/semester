use crate::models::{AttendanceSummary, BunkGuard, SGPAResult, Subject, SubjectResult};

/// Official GGSIPU Ordinance 11 (CBCS 10-Point Scale) Grade Points:
/// O=10 (90-100), A+=9 (75-89), A=8 (65-74), B+=7 (55-64), B=6 (50-54),
/// C=5 (45-49), P=4 (40-44), F=0 (<40).
pub fn ipu_grade_to_points(grade: &str) -> u32 {
    match grade.trim().to_uppercase().as_str() {
        "O" => 10,
        "A+" => 9,
        "A" => 8,
        "B+" => 7,
        "B" => 6,
        "C" | "C+" => 5,
        "P" => 4,
        _ => 0,
    }
}

pub fn score_to_ipu_grade(pct: f64) -> &'static str {
    if pct >= 90.0 {
        "O"
    } else if pct >= 75.0 {
        "A+"
    } else if pct >= 65.0 {
        "A"
    } else if pct >= 55.0 {
        "B+"
    } else if pct >= 50.0 {
        "B"
    } else if pct >= 45.0 {
        "C"
    } else if pct >= 40.0 {
        "P"
    } else {
        "F"
    }
}

/// Calculates medical-adjusted BunkGuard: removes approved medical leaves from both
/// numerator and denominator before evaluating safe bunks / classes needed.
pub fn calculate_medical_adjusted_bunk_guard(
    attended: u32,
    total: u32,
    medical_count: u32,
    target: u32,
) -> BunkGuard {
    let adj_att = attended.saturating_sub(medical_count);
    let adj_tot = total.saturating_sub(medical_count);
    calculate_bunk_guard(adj_att, adj_tot, target)
}

/// Computes the exact SGPA required in the upcoming semester to hit `target_cgpa`
/// under official GGSIPU Ordinance 11 credit-weighted cumulative GPA.
pub fn calculate_required_sgpa(
    earned_credits: u32,
    earned_grade_points: f64,
    next_sem_credits: u32,
    target_cgpa: f64,
) -> f64 {
    if next_sem_credits == 0 {
        return 0.0;
    }
    let total_cr = (earned_credits + next_sem_credits) as f64;
    let raw = (target_cgpa * total_cr - earned_grade_points) / (next_sem_credits as f64);
    (raw * 100.0).round() / 100.0
}

/// Calculate attendance percentage rounded to two decimal places
pub fn calculate_percentage(attended: u32, total: u32) -> f64 {
    if total == 0 {
        return 0.0;
    }
    ((attended as f64 / total as f64) * 10000.0).round() / 100.0
}

/// Calculate BunkGuard metrics: whether a student can safely bunk, and how many classes
pub fn calculate_bunk_guard(attended: u32, total: u32, target: u32) -> BunkGuard {
    let pct = calculate_percentage(attended, total);
    let target_f = target as f64;

    if target >= 100 {
        let missed = total.saturating_sub(attended);
        return BunkGuard {
            percentage: pct,
            can_bunk: missed == 0,
            count: missed,
            status_message: if missed == 0 {
                "Perfect attendance! Cannot bunk any class.".to_string()
            } else {
                format!("Missed {} class(es). 100% attendance is no longer achievable.", missed)
            },
        };
    }

    if pct >= target_f {
        let can_bunk = (attended * 100).saturating_sub(target * total) / target;
        BunkGuard {
            percentage: pct,
            can_bunk: true,
            count: can_bunk,
            status_message: if can_bunk > 0 {
                format!("You can safely skip {} more class(es).", can_bunk)
            } else {
                "On the edge! Don't bunk any classes.".to_string()
            },
        }
    } else {
        let numerator = (target * total).saturating_sub(100 * attended);
        let denominator = 100 - target;
        let mut must_attend = numerator / denominator;
        if numerator % denominator != 0 {
            must_attend += 1;
        }
        BunkGuard {
            percentage: pct,
            can_bunk: false,
            count: must_attend,
            status_message: format!("Attend next {} class(es) to reach {}%.", must_attend, target),
        }
    }
}

/// Calculate medical-adjusted attendance: medical leaves are removed from both numerator and denominator
pub fn calculate_medical_adjusted(attended: u32, total: u32, medical_count: u32) -> f64 {
    let adjusted_total = total.saturating_sub(medical_count);
    let adjusted_attended = attended.saturating_sub(medical_count);
    calculate_percentage(adjusted_attended, adjusted_total)
}

/// Calculate overall attendance summary across all subjects
pub fn get_attendance_summary(subjects: &[Subject], target: u32) -> AttendanceSummary {
    if subjects.is_empty() {
        return AttendanceSummary {
            overall_percentage: 0.0,
            total_attended: 0,
            total_classes: 0,
            subject_count: 0,
            risk_level: "No Data".to_string(),
            safe_bunks_remaining: 0,
        };
    }

    let total_attended: u32 = subjects.iter().map(|s| s.attended).sum();
    let total_classes: u32 = subjects.iter().map(|s| s.total).sum();
    let pct = calculate_percentage(total_attended, total_classes);

    let risk_level = if pct >= target as f64 {
        "Safe".to_string()
    } else if pct >= (target.saturating_sub(15)) as f64 {
        "Warning".to_string()
    } else {
        "Critical".to_string()
    };

    let safe_bunks = if total_classes > 0 && pct >= target as f64 {
        (total_attended * 100).saturating_sub(target * total_classes) / target
    } else {
        0
    };

    AttendanceSummary {
        overall_percentage: pct,
        total_attended,
        total_classes,
        subject_count: subjects.len() as u32,
        risk_level,
        safe_bunks_remaining: safe_bunks,
    }
}

/// "What-If" Attendance Simulator: predicts attendance % given hypothetical future attendance
pub fn simulate_future_attendance(
    current_attended: u32,
    current_total: u32,
    future_classes: u32,
    future_attended: u32,
) -> f64 {
    let new_attended = current_attended + future_attended.min(future_classes);
    let new_total = current_total + future_classes;
    calculate_percentage(new_attended, new_total)
}

/// Calculate SGPA given a list of subject results with credit weights
pub fn calculate_sgpa(results: &[SubjectResult]) -> SGPAResult {
    let mut weighted_sum: f64 = 0.0;
    let mut total_credits: u32 = 0;
    let mut earned_credits: u32 = 0;

    for r in results {
        total_credits += r.credits;
        weighted_sum += (r.credits as f64) * (r.grade_point as f64);
        if r.grade_point > 0 {
            earned_credits += r.credits;
        }
    }

    let sgpa = if total_credits > 0 {
        ((weighted_sum / (total_credits as f64)) * 100.0).round() / 100.0
    } else {
        0.0
    };

    SGPAResult {
        sgpa,
        total_credits,
        earned_credits,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_percentage_calculation() {
        assert_eq!(calculate_percentage(3, 4), 75.0);
        assert_eq!(calculate_percentage(10, 32), 31.25);
        assert_eq!(calculate_percentage(0, 0), 0.0);
    }

    #[test]
    fn test_bunk_guard_safe() {
        // 80 out of 100 with 75% target -> can bunk 6 classes
        let bg = calculate_bunk_guard(80, 100, 75);
        assert!(bg.can_bunk);
        assert_eq!(bg.count, 6);
    }

    #[test]
    fn test_bunk_guard_deficit() {
        // 10 out of 32 with 75% target -> need 56 classes
        let bg = calculate_bunk_guard(10, 32, 75);
        assert!(!bg.can_bunk);
        assert_eq!(bg.count, 56);
    }

    #[test]
    fn test_simulate_future() {
        // currently 10/20 (50%). If 10 classes occur and student attends all 10 -> 20/30 = 66.67%
        let sim = simulate_future_attendance(10, 20, 10, 10);
        assert_eq!(sim, 66.67);
    }

    #[test]
    fn test_sgpa_calculation() {
        let subjects = vec![
            SubjectResult {
                subject_code: "CS101".to_string(),
                subject_name: "Programming".to_string(),
                credits: 4,
                internal_marks: 20.0,
                external_marks: 70.0,
                total_marks: 90.0,
                grade: "O".to_string(),
                grade_point: 10,
            },
            SubjectResult {
                subject_code: "MA101".to_string(),
                subject_name: "Mathematics".to_string(),
                credits: 4,
                internal_marks: 18.0,
                external_marks: 50.0,
                total_marks: 68.0,
                grade: "A".to_string(),
                grade_point: 8,
            },
        ];
        let res = calculate_sgpa(&subjects);
        assert_eq!(res.sgpa, 9.0);
        assert_eq!(res.total_credits, 8);
    }
}
