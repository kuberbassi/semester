package com.semester.app.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class AiProvider(val id: String, val label: String) {
    LOCAL_RUST("local", "On-Device (Instant)"),
    GEMINI("gemini", "Gemini Flash"),
    GROQ("groq", "Groq Llama"),
}

/**
 * Bring-Your-Own-Key (BYOK) AI client for optional cloud intelligence.
 * Never embeds any developer key — keys stay strictly on-device in private app storage.
 */
object ByokAiClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(35, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun askCloud(
        provider: AiProvider,
        apiKey: String,
        question: String,
        academicContext: String,
    ): String = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "Add your ${provider.label} API key in AI settings first." }

        val systemPrompt = buildString {
            appendLine("You are Semester AI, a concise academic assistant for an Indian college student (GGSIPU).")
            appendLine("Use ONLY the student's live workspace snapshot below to answer accurately with numbers and actionable advice.")
            appendLine("Be concise, clear, and practical. Avoid filler.")
            appendLine("\n--- LIVE WORKSPACE CONTEXT ---")
            appendLine(academicContext)
        }

        when (provider) {
            AiProvider.GEMINI -> askGemini(apiKey.trim(), systemPrompt, question)
            AiProvider.GROQ -> askGroq(apiKey.trim(), systemPrompt, question)
            AiProvider.LOCAL_RUST -> error("Use Rust WorkspaceDb for offline local assistant.")
        }
    }

    private fun askGemini(apiKey: String, systemPrompt: String, question: String): String {
        val url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$apiKey"
        val body = JSONObject().apply {
            put(
                "system_instruction",
                JSONObject().put(
                    "parts",
                    JSONArray().put(JSONObject().put("text", systemPrompt)),
                ),
            )
            put(
                "contents",
                JSONArray().put(
                    JSONObject()
                        .put("role", "user")
                        .put("parts", JSONArray().put(JSONObject().put("text", question))),
                ),
            )
            put(
                "generationConfig",
                JSONObject().put("temperature", 0.35).put("maxOutputTokens", 700),
            )
        }
        val req = Request.Builder()
            .url(url)
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("Gemini API error (${resp.code}): ${raw.take(180)}")
            }
            val parsed = JSONObject(raw)
            val text = parsed.optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text")
            return text?.trim().orEmpty().ifBlank { "No response returned by Gemini." }
        }
    }

    private fun askGroq(apiKey: String, systemPrompt: String, question: String): String {
        val body = JSONObject().apply {
            put("model", "llama-3.3-70b-versatile")
            put("temperature", 0.35)
            put("max_tokens", 700)
            put(
                "messages",
                JSONArray()
                    .put(JSONObject().put("role", "system").put("content", systemPrompt))
                    .put(JSONObject().put("role", "user").put("content", question)),
            )
        }
        val req = Request.Builder()
            .url("https://api.groq.com/openai/v1/chat/completions")
            .header("Authorization", "Bearer $apiKey")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                throw IllegalStateException("Groq API error (${resp.code}): ${raw.take(180)}")
            }
            val parsed = JSONObject(raw)
            val text = parsed.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
            return text?.trim().orEmpty().ifBlank { "No response returned by Groq." }
        }
    }
}
