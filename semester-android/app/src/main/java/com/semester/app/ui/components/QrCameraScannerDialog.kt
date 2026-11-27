package com.semester.app.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FlashOff
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.GlobalHistogramBinarizer
import com.google.zxing.common.HybridBinarizer
import com.semester.app.ui.theme.SemesterColors
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 100% Offline, Built-in CameraX + ZXing QR Code Scanner.
 * Zero dependency on Google Play Services module downloads — works instantly on every Android device
 * and reads high-density SEMQR2 timetable QR codes directly from laptop screens or phones.
 */
@Composable
fun QrCameraScannerDialog(
    onScanned: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPerm by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var permAsked by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    var boundCamera by remember { mutableStateOf<Camera?>(null) }
    var cameraError by remember { mutableStateOf<String?>(null) }

    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCameraPerm = granted
        permAsked = true
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPerm) {
            permLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    val delivered = remember { AtomicBoolean(false) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val reader = remember {
        MultiFormatReader().apply {
            setHints(
                mapOf(
                    DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                    DecodeHintType.TRY_HARDER to true,
                    DecodeHintType.CHARACTER_SET to "UTF-8",
                ),
            )
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { boundCamera?.cameraControl?.enableTorch(false) }
            runCatching { ProcessCameraProvider.getInstance(context).get().unbindAll() }
            analysisExecutor.shutdown()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = true, dismissOnClickOutside = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF06080E)),
        ) {
            if (hasCameraPerm && cameraError == null) {
                AndroidView(
                    factory = { ctx ->
                        val previewView = PreviewView(ctx).apply {
                            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                        }
                        val providerFuture = ProcessCameraProvider.getInstance(ctx)
                        providerFuture.addListener(
                            {
                                runCatching {
                                    val provider = providerFuture.get()
                                    val preview = Preview.Builder().build().also {
                                        it.surfaceProvider = previewView.surfaceProvider
                                    }
                                    val resolutionSelector = ResolutionSelector.Builder()
                                        .setResolutionStrategy(
                                            ResolutionStrategy(
                                                Size(1280, 720),
                                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                                            ),
                                        )
                                        .build()
                                    val analysis = ImageAnalysis.Builder()
                                        .setResolutionSelector(resolutionSelector)
                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                        .build()
                                    analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                        decodeQrFrame(imageProxy, reader)?.let { text ->
                                            if (delivered.compareAndSet(false, true)) {
                                                ContextCompat.getMainExecutor(ctx).execute {
                                                    onScanned(text)
                                                }
                                            }
                                        }
                                    }
                                    provider.unbindAll()
                                    boundCamera = provider.bindToLifecycle(
                                        lifecycleOwner,
                                        CameraSelector.DEFAULT_BACK_CAMERA,
                                        preview,
                                        analysis,
                                    )
                                }.onFailure { err ->
                                    cameraError = err.message ?: "Could not start camera."
                                }
                            },
                            ContextCompat.getMainExecutor(ctx),
                        )
                        previewView
                    },
                    modifier = Modifier.fillMaxSize(),
                )

                // Clean viewfinder overlay
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val boxSize = minOf(size.width, size.height) * 0.68f
                    val left = (size.width - boxSize) / 2f
                    val top = (size.height - boxSize) / 2f
                    val right = left + boxSize
                    val bottom = top + boxSize
                    val cornerLen = 34.dp.toPx()
                    val strokeW = 4.dp.toPx()

                    // Soft scrim outside focus window
                    val scrim = Color.Black.copy(alpha = 0.56f)
                    drawRect(scrim, topLeft = Offset.Zero, size = androidx.compose.ui.geometry.Size(size.width, top))
                    drawRect(scrim, topLeft = Offset(0f, bottom), size = androidx.compose.ui.geometry.Size(size.width, size.height - bottom))
                    drawRect(scrim, topLeft = Offset(0f, top), size = androidx.compose.ui.geometry.Size(left, boxSize))
                    drawRect(scrim, topLeft = Offset(right, top), size = androidx.compose.ui.geometry.Size(size.width - right, boxSize))

                    drawRoundRect(
                        color = Color.White.copy(alpha = 0.20f),
                        topLeft = Offset(left, top),
                        size = androidx.compose.ui.geometry.Size(boxSize, boxSize),
                        cornerRadius = CornerRadius(22.dp.toPx()),
                        style = Stroke(width = 1.2.dp.toPx()),
                    )

                    val accent = SemesterColors.BrandCyan
                    // Top-left
                    drawLine(accent, Offset(left, top + cornerLen), Offset(left, top), strokeW, StrokeCap.Round)
                    drawLine(accent, Offset(left, top), Offset(left + cornerLen, top), strokeW, StrokeCap.Round)
                    // Top-right
                    drawLine(accent, Offset(right - cornerLen, top), Offset(right, top), strokeW, StrokeCap.Round)
                    drawLine(accent, Offset(right, top), Offset(right, top + cornerLen), strokeW, StrokeCap.Round)
                    // Bottom-left
                    drawLine(accent, Offset(left, bottom - cornerLen), Offset(left, bottom), strokeW, StrokeCap.Round)
                    drawLine(accent, Offset(left, bottom), Offset(left + cornerLen, bottom), strokeW, StrokeCap.Round)
                    // Bottom-right
                    drawLine(accent, Offset(right - cornerLen, bottom), Offset(right, bottom), strokeW, StrokeCap.Round)
                    drawLine(accent, Offset(right, bottom), Offset(right, bottom - cornerLen), strokeW, StrokeCap.Round)
                }
            } else {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = if (cameraError != null) "Camera Unavailable" else "Camera Permission Needed",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Text(
                        text = cameraError
                            ?: if (permAsked) "Allow camera permission in Android Settings to scan timetable QR codes directly, or use Gallery Image / Paste Code."
                            else "Allow camera access to scan timetable QR codes.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFFB4BED2),
                        textAlign = TextAlign.Center,
                    )
                    if (!hasCameraPerm) {
                        Spacer(Modifier.height(4.dp))
                        GradientButton(
                            text = "Grant Camera Access",
                            onClick = { permLauncher.launch(Manifest.permission.CAMERA) },
                        )
                    }
                }
            }

            // Top bar: Close + Title + Torch
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 14.dp)
                    .align(Alignment.TopCenter),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f))
                        .border(1.dp, Color.White.copy(alpha = 0.22f), CircleShape)
                        .clickable { onDismiss() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close scanner", tint = Color.White)
                }

                Text(
                    text = "Scan Timetable QR",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )

                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(if (torchOn) SemesterColors.BrandCobalt.copy(alpha = 0.85f) else Color.Black.copy(alpha = 0.55f))
                        .border(1.dp, Color.White.copy(alpha = 0.22f), CircleShape)
                        .clickable {
                            val next = !torchOn
                            torchOn = next
                            runCatching { boundCamera?.cameraControl?.enableTorch(next) }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (torchOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                        contentDescription = "Toggle Flashlight",
                        tint = Color.White,
                    )
                }
            }

            // Bottom helper pill
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 28.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color.Black.copy(alpha = 0.65f))
                    .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(18.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text(
                    text = "Align the QR code from Semester Desktop or a classmate inside the frame",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFE2E8F0),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

private fun decodeQrFrame(imageProxy: ImageProxy, reader: MultiFormatReader): String? {
    try {
        val plane = imageProxy.planes.firstOrNull() ?: return null
        val buffer = plane.buffer
        val width = imageProxy.width
        val height = imageProxy.height
        val rowStride = plane.rowStride

        // Copy Y luminance channel compactly (handling rowStride padding cleanly)
        val yBytes = ByteArray(width * height)
        if (rowStride == width) {
            buffer.get(yBytes, 0, yBytes.size)
        } else {
            val rowBuf = ByteArray(rowStride)
            for (row in 0 until height) {
                val remaining = buffer.remaining()
                if (remaining <= 0) break
                val toRead = minOf(rowStride, remaining)
                buffer.get(rowBuf, 0, toRead)
                System.arraycopy(rowBuf, 0, yBytes, row * width, minOf(width, toRead))
            }
        }

        val source = PlanarYUVLuminanceSource(
            yBytes,
            width,
            height,
            0,
            0,
            width,
            height,
            false,
        )
        // Try HybridBinarizer first (best for dense screen QR), then GlobalHistogramBinarizer fallback
        val result = runCatching { reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))) }
            .recoverCatching {
                reader.reset()
                reader.decodeWithState(BinaryBitmap(GlobalHistogramBinarizer(source)))
            }
            .getOrNull()
        reader.reset()
        return result?.text?.takeIf { it.isNotBlank() }
    } catch (_: Throwable) {
        return null
    } finally {
        imageProxy.close()
    }
}
