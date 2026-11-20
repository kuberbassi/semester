package com.semester.app.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Native Hardware Haptic Engine
 * Utilizes the device's Linear Resonant Actuator (LRA) motor
 * to emulate Apple Watch Digital Crown rotary detents and UI tactile clicks.
 */
class HapticCrownEngine(context: Context) {

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    /**
     * 1. Digital Crown Detent (~7.2° rotary notch while dragging the radial bubble menu)
     */
    fun crownTick() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(10)
        }
    }

    /**
     * 2. Item Focus Detent (Snapping to a subject or menu page)
     */
    fun focusSnap() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(25)
        }
    }

    /**
     * 3. Selection Confirmation (Lifting finger or confirming action)
     */
    fun selectionConfirm() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(45)
        }
    }

    /**
     * 4. Double Pop for Attendance Success
     */
    fun attendanceSuccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(
                VibrationEffect.createWaveform(longArrayOf(0, 15, 40, 25), intArrayOf(0, 180, 0, 255), -1)
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(50)
        }
    }
}
