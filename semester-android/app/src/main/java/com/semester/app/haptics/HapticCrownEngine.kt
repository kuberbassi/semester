package com.semester.app.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Precision Linear Resonant Actuator (LRA) Haptic Engine.
 * Uses Android 11+ VibrationEffect.Composition hardware primitives (PRIMITIVE_LOW_TICK,
 * PRIMITIVE_TICK, PRIMITIVE_CLICK, PRIMITIVE_THUD) for crisp, zero-mushiness tactile feedback
 * across navigation, rotary dials, toggles, back gestures, and confirmations.
 */
class HapticCrownEngine(context: Context) {

    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private val supportsComposition: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
        (vibrator?.areAllPrimitivesSupported(
            VibrationEffect.Composition.PRIMITIVE_TICK,
            VibrationEffect.Composition.PRIMITIVE_CLICK,
        ) == true)

    private val supportsLowTick: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        (vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_LOW_TICK) == true)

    private val supportsThud: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        (vibrator?.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_THUD) == true)

    private var lastTickMs: Long = 0L

    /**
     * Ultra-crisp rotary/scroll/slider micro-detent (throttled at 24ms to prevent motor muddiness).
     */
    fun crownTick() {
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastTickMs < 24L) return
        lastTickMs = now

        val v = vibrator ?: return
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && supportsLowTick -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_LOW_TICK, 0.52f)
                        .compose(),
                )
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && supportsComposition -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.45f)
                        .compose(),
                )
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
            }
            else -> {
                @Suppress("DEPRECATION")
                v.vibrate(8)
            }
        }
    }

    /**
     * Tactile magnetic detent for tab focus, toggle switches, and radial bubble hover lock.
     */
    fun focusSnap() {
        val v = vibrator ?: return
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && supportsComposition -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.72f)
                        .compose(),
                )
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
            }
            else -> {
                @Suppress("DEPRECATION")
                v.vibrate(16)
            }
        }
    }

    /**
     * Crisp authoritative confirmation for primary actions, bubble release, and destructive steps.
     */
    fun selectionConfirm() {
        val v = vibrator ?: return
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && supportsComposition -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.92f)
                        .compose(),
                )
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
            }
            else -> {
                @Suppress("DEPRECATION")
                v.vibrate(28)
            }
        }
    }

    /**
     * Signature rising double-pulse for marking attendance present, saving, or sync completion.
     */
    fun attendanceSuccess() {
        val v = vibrator ?: return
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && supportsComposition -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.55f, 0)
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.95f, 48)
                        .compose(),
                )
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                v.vibrate(
                    VibrationEffect.createWaveform(longArrayOf(0, 12, 42, 20), intArrayOf(0, 160, 0, 240), -1),
                )
            }
            else -> {
                @Suppress("DEPRECATION")
                v.vibrate(35)
            }
        }
    }

    /**
     * Soft grounded pulse for back navigation, dismissals, or skipped classes.
     */
    fun softDismiss() {
        val v = vibrator ?: return
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && supportsThud -> {
                v.vibrate(
                    VibrationEffect.startComposition()
                        .addPrimitive(VibrationEffect.Composition.PRIMITIVE_THUD, 0.55f)
                        .compose(),
                )
            }
            else -> crownTick()
        }
    }
}
