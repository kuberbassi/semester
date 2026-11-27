package com.semester.app.core

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import java.util.Locale

/**
 * Clean, print-ready Academic Transcript PDF Exporter (native `android.graphics.pdf.PdfDocument`).
 * Matches Desktop's minimalist clean result PDF export — zero external libraries required.
 */
object ResultsPdfExporter {

    fun writeTranscriptPdf(
        context: Context,
        uri: Uri,
        analytics: ResultsAnalytics,
    ): Result<Unit> = runCatching {
        val doc = PdfDocument()
        val pageWidth = 595 // A4 @ 72dpi
        val pageHeight = 842
        val margin = 40f

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#0F172A")
            textSize = 20f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }
        val subtitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#475569")
            textSize = 10f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        }
        val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#4F46E5")
            textSize = 22f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }
        val sectionPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1E293B")
            textSize = 12.5f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }
        val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#334155")
            textSize = 8.5f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#0F172A")
            textSize = 9f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#CBD5E1")
            strokeWidth = 0.8f
        }
        val headerBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#F1F5F9")
            style = Paint.Style.FILL
        }

        var pageNum = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNum).create())
        var canvas = page.canvas
        var y = 48f

        fun ensureSpace(needed: Float) {
            if (y + needed > pageHeight - 44f) {
                doc.finishPage(page)
                pageNum++
                page = doc.startPage(PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNum).create())
                canvas = page.canvas
                y = 48f
            }
        }

        // Top Transcript Header
        canvas.drawText("ACADEMIC TRANSCRIPT", margin, y - 14f, headerPaint)
        canvas.drawText(analytics.studentName.ifBlank { "GGSIPU Student" }, margin, y + 6f, titlePaint)
        val cgpaStr = "CGPA ${String.format(Locale.US, "%.2f", analytics.cgpa)}"
        val cgpaW = accentPaint.measureText(cgpaStr)
        canvas.drawText(cgpaStr, pageWidth - margin - cgpaW, y + 6f, accentPaint)
        y += 22f

        val metaLine = buildString {
            if (analytics.enrollmentNumber.isNotBlank()) append("Enrollment: ${analytics.enrollmentNumber}")
            if (analytics.program.isNotBlank()) append("   |   ${analytics.program}")
        }
        canvas.drawText(metaLine.take(92), margin, y, subtitlePaint)
        y += 14f
        val instLine = buildString {
            if (analytics.institute.isNotBlank()) append(analytics.institute)
            if (analytics.batch.isNotBlank()) append("   |   Batch ${analytics.batch}")
        }
        if (instLine.isNotBlank()) {
            canvas.drawText(instLine.take(92), margin, y, subtitlePaint)
            y += 14f
        }

        // Summary KPI strip
        y += 6f
        canvas.drawRect(margin, y, pageWidth - margin, y + 26f, headerBgPaint)
        val kpiText = "Aggregate: ${String.format(Locale.US, "%.1f", analytics.academicStrength)}%   •   " +
            "Marks: ${analytics.totalScoredMarks.toInt()}/${analytics.totalMaxMarks.toInt()}   •   " +
            "Earned Credits: ${analytics.totalCredits}   •   " +
            "Distinctions: ${analytics.distinctions}   •   " +
            "Pass Rate: ${String.format(Locale.US, "%.0f", analytics.passRate)}%"
        canvas.drawText(kpiText, margin + 10f, y + 16f, headerPaint)
        y += 42f

        // Per-Semester Tables
        for (sem in analytics.semesters) {
            ensureSpace(64f)
            canvas.drawText(
                "${sem.semesterLabel}  —  SGPA ${String.format(Locale.US, "%.2f", sem.sgpa)}  •  ${sem.totalCredits} Credits  •  ${sem.totalMarks.toInt()}/${sem.maxMarks.toInt()}",
                margin,
                y,
                sectionPaint,
            )
            y += 10f

            // Table Header
            canvas.drawRect(margin, y, pageWidth - margin, y + 18f, headerBgPaint)
            canvas.drawText("CODE", margin + 6f, y + 12f, headerPaint)
            canvas.drawText("SUBJECT", margin + 68f, y + 12f, headerPaint)
            canvas.drawText("CR", margin + 325f, y + 12f, headerPaint)
            canvas.drawText("INT", margin + 358f, y + 12f, headerPaint)
            canvas.drawText("EXT", margin + 395f, y + 12f, headerPaint)
            canvas.drawText("TOTAL", margin + 435f, y + 12f, headerPaint)
            canvas.drawText("GRADE", margin + 482f, y + 12f, headerPaint)
            y += 26f

            for (sub in sem.subjects) {
                ensureSpace(20f)
                canvas.drawText(sub.code.take(9), margin + 6f, y, bodyPaint)
                canvas.drawText(sub.name.take(40), margin + 68f, y, bodyPaint)
                canvas.drawText("${sub.credits}", margin + 328f, y, bodyPaint)
                canvas.drawText(sub.internalStr.take(4), margin + 360f, y, bodyPaint)
                canvas.drawText(sub.externalStr.take(4), margin + 397f, y, bodyPaint)
                canvas.drawText(if (sub.isPending) "-" else "${sub.total.toInt()}", margin + 440f, y, bodyPaint)
                canvas.drawText(sub.grade, margin + 488f, y, headerPaint)
                y += 6f
                canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
                y += 12f
            }
            y += 14f
        }

        // Footer
        canvas.drawText("Generated offline by Semester — GGSIPU Ordinance 11 Credit-Weighted Transcript", margin, pageHeight - 24f, subtitlePaint)
        doc.finishPage(page)

        context.contentResolver.openOutputStream(uri)?.use { out ->
            doc.writeTo(out)
        } ?: error("Unable to open output stream for PDF.")
        doc.close()
    }
}
