package com.semester.app.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

data class IpuCaptchaChallenge(
    val captchaPngBytes: ByteArray,
    val loginActionUrl: String,
    val hiddenFields: Map<String, String>,
    val usernameField: String,
    val passwordField: String,
    val captchaField: String,
    val hashPassword: Boolean,
)

data class IpuPortalFetchResult(
    val studentInfoJson: String,
    val semestersJson: String,
    val semesterCount: Int,
    val paperCount: Int,
)

/**
 * Live Spring Boot GGSIPU ExamWeb client (`examweb.ggsipu.ac.in`), matching Desktop `ipu.rs` 1:1.
 * Displays the real live CAPTCHA image to the user (never automates or bypasses CAPTCHA),
 * hashes the password via Rust `coreIpuSaltedPasswordHash` (matching `/web/js/crypt.js`),
 * and parses responses via Rust `coreParseIpuPortalResponse`.
 */
class IpuPortalClient(
    private val hashSaltedPassword: (password: String, captcha: String) -> String = ::fallbackSaltedSha256,
    private val parseEnvelope: (responseText: String, fallbackSemester: UInt?) -> String,
) {
    private val cookieStore = ConcurrentHashMap<String, MutableList<Cookie>>()

    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val host = url.host.lowercase()
            val list = cookieStore.getOrPut(host) { mutableListOf() }
            synchronized(list) {
                for (c in cookies) {
                    list.removeAll { it.name == c.name && it.path == c.path }
                    list.add(c)
                }
            }
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val host = url.host.lowercase()
            val list = cookieStore[host] ?: return emptyList()
            synchronized(list) {
                val now = System.currentTimeMillis()
                list.removeAll { it.expiresAt < now }
                return list.toList()
            }
        }
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(28, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    suspend fun startSession(): IpuCaptchaChallenge = withContext(Dispatchers.IO) {
        cookieStore.clear()
        val loginReq = Request.Builder()
            .url(IPU_LOGIN_URL)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .get()
            .build()

        val html: String
        client.newCall(loginReq).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw IllegalStateException("IPU portal returned HTTP ${resp.code}. The university server may be busy.")
            }
            html = resp.body?.string().orEmpty()
        }
        if (html.isBlank()) {
            throw IllegalStateException("Empty login page returned by examweb.ggsipu.ac.in.")
        }

        val captchaSrc = findCaptchaSrc(html)
            ?: throw IllegalStateException("Could not locate CAPTCHA image on the IPU login page.")
        val captchaUrl = resolveUrl(captchaSrc, IPU_LOGIN_URL)

        val imgReq = Request.Builder()
            .url(captchaUrl)
            .header("User-Agent", USER_AGENT)
            .header("Referer", IPU_LOGIN_URL)
            .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
            .get()
            .build()

        val bytes: ByteArray
        val contentType: String
        client.newCall(imgReq).execute().use { resp ->
            contentType = resp.header("Content-Type").orEmpty().lowercase()
            bytes = resp.body?.bytes() ?: ByteArray(0)
        }
        if (bytes.size < 100 || contentType.startsWith("text/")) {
            throw IllegalStateException("IPU portal returned an invalid CAPTCHA image. Tap refresh to retry.")
        }

        val (userField, passField, capField) = detectFieldNames(html)
        IpuCaptchaChallenge(
            captchaPngBytes = bytes,
            loginActionUrl = detectLoginAction(html),
            hiddenFields = extractHiddenFields(html),
            usernameField = userField,
            passwordField = passField,
            captchaField = capField,
            hashPassword = html.contains("hashPassword", ignoreCase = true) ||
                html.contains("crypt.js", ignoreCase = true),
        )
    }

    suspend fun loginAndFetchResults(
        challenge: IpuCaptchaChallenge,
        enrollment: String,
        password: String,
        captcha: String,
    ): IpuPortalFetchResult = withContext(Dispatchers.IO) {
        val enroll = enrollment.trim()
        val cap = captcha.trim()
        require(enroll.isNotEmpty() && password.isNotEmpty() && cap.isNotEmpty()) {
            "Enrollment number, password, and CAPTCHA are all required."
        }

        val submittedPassword = if (challenge.hashPassword) {
            hashSaltedPassword(password, cap)
        } else {
            password
        }

        val formBuilder = FormBody.Builder()
        val addedKeys = hashSetOf<String>()
        for ((k, v) in challenge.hiddenFields) {
            if (!k.equals(challenge.usernameField, true) &&
                !k.equals(challenge.passwordField, true) &&
                !k.equals(challenge.captchaField, true)
            ) {
                formBuilder.add(k, v)
                addedKeys.add(k.lowercase())
            }
        }
        formBuilder.add(challenge.usernameField, enroll)
        formBuilder.add(challenge.passwordField, submittedPassword)
        formBuilder.add(challenge.captchaField, cap)

        val loginPost = Request.Builder()
            .url(challenge.loginActionUrl)
            .header("User-Agent", USER_AGENT)
            .header("Referer", IPU_LOGIN_URL)
            .header("Origin", IPU_BASE)
            .post(formBuilder.build())
            .build()

        val finalUrl: String
        val homeHtml: String
        client.newCall(loginPost).execute().use { resp ->
            finalUrl = resp.request.url.toString()
            homeHtml = resp.body?.string().orEmpty()
        }

        val lowerUrl = finalUrl.lowercase()
        val lowerHtml = homeHtml.lowercase()
        val looksLoggedIn = lowerUrl.contains("studenthome") ||
            lowerHtml.contains("searchform") ||
            lowerHtml.contains("/web/student/search")

        if (!looksLoggedIn) {
            val hint = extractPortalError(homeHtml)
            throw IllegalStateException(
                hint ?: "Login rejected by IPU ExamWeb (check Enrollment Number, Password, or exact CAPTCHA case).",
            )
        }

        val searchMode = Regex("""id=["']searchMode["'][^>]*value=["']([^"']+)["']""", RegexOption.IGNORE_CASE)
            .find(homeHtml)?.groupValues?.getOrNull(1)?.trim().orEmpty().ifBlank { "2" }

        val discoveredSemesters = Regex("""<option[^>]*value=["'](\d{1,3})["']""", RegexOption.IGNORE_CASE)
            .findAll(homeHtml)
            .mapNotNull { it.groupValues.getOrNull(1)?.toIntOrNull() }
            .distinct()
            .toList()

        val mergedStudentInfo = JSONObject()
        val semestersByNum = linkedMapOf<Int, JSONObject>()

        // 1. Fast path: euno=100 returns ALL published semesters in a single JSON call
        val allBody = fetchSearchEndpoint(searchMode, 100)
        if (!allBody.isNullOrBlank()) {
            runCatching { parseEnvelope(allBody, null) }.getOrNull()?.let { parsedJson ->
                mergeParsedEnvelope(parsedJson, mergedStudentInfo, semestersByNum)
            }
        }

        // 2. Fallback / supplement: fetch individual semester values discovered on studenthome
        if (semestersByNum.isEmpty()) {
            val targets = discoveredSemesters.filter { it in 1..12 }.ifEmpty { listOf(1, 2, 3, 4, 5, 6, 7, 8) }
            for (sem in targets) {
                val body = fetchSearchEndpoint(searchMode, sem) ?: continue
                runCatching { parseEnvelope(body, sem.toUInt()) }.getOrNull()?.let { parsedJson ->
                    mergeParsedEnvelope(parsedJson, mergedStudentInfo, semestersByNum)
                }
            }
        }

        if (semestersByNum.isEmpty()) {
            throw IllegalStateException(
                "Logged in to IPU ExamWeb successfully, but no published semester results were found yet.",
            )
        }

        val sortedSems = semestersByNum.entries.sortedBy { it.key }.map { it.value }
        val semArray = JSONArray()
        var totalPapers = 0
        for (semObj in sortedSems) {
            semArray.put(semObj)
            totalPapers += semObj.optJSONArray("subjects")?.length() ?: 0
        }

        IpuPortalFetchResult(
            studentInfoJson = mergedStudentInfo.toString(),
            semestersJson = semArray.toString(),
            semesterCount = sortedSems.size,
            paperCount = totalPapers,
        )
    }

    private fun fetchSearchEndpoint(flag: String, euno: Int): String? {
        val url = "$IPU_BASE/web/student/search?flag=$flag&euno=$euno"
        val req = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", IPU_HOME_URL)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/plain, */*")
            .get()
            .build()
        return runCatching {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) null else resp.body?.string()?.trim()
            }
        }.getOrNull()
    }

    private fun mergeParsedEnvelope(
        parsedJson: String,
        dstInfo: JSONObject,
        dstSemesters: MutableMap<Int, JSONObject>,
    ) {
        val root = JSONObject(parsedJson)
        root.optJSONObject("student_info")?.let { info ->
            val keys = info.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val v = info.optString(k)
                if (v.isNotBlank() && v != "---") dstInfo.put(k, v)
            }
        }
        val sems = root.optJSONArray("semesters") ?: return
        for (i in 0 until sems.length()) {
            val s = sems.optJSONObject(i) ?: continue
            val num = s.optInt("semester", s.optInt("semester_num", 0))
            if (num > 0) dstSemesters[num] = s
        }
    }

    private fun findCaptchaSrc(html: String): String? {
        val imgRegex = Regex("""<img[^>]+src=["']([^"']+)["'][^>]*>""", RegexOption.IGNORE_CASE)
        val matches = imgRegex.findAll(html).toList()
        for (m in matches) {
            val tag = m.value.lowercase()
            val src = m.groupValues[1]
            if (tag.contains("captcha") || src.contains("captcha", ignoreCase = true)) {
                return src
            }
        }
        return "/web/CaptchaServlet"
    }

    private fun detectLoginAction(html: String): String {
        val m = Regex("""<form[^>]+action=["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(html)
        val raw = m?.groupValues?.getOrNull(1)?.trim().orEmpty()
        if (raw.isEmpty()) return IPU_LOGIN_ACTION
        return resolveUrl(raw, IPU_LOGIN_URL)
    }

    private fun extractHiddenFields(html: String): Map<String, String> {
        val out = linkedMapOf<String, String>()
        val inputRegex = Regex("""<input[^>]+type=["']hidden["'][^>]*>""", RegexOption.IGNORE_CASE)
        val nameRegex = Regex("""name=["']([^"']+)["']""", RegexOption.IGNORE_CASE)
        val valRegex = Regex("""value=["']([^"']*)["']""", RegexOption.IGNORE_CASE)
        for (m in inputRegex.findAll(html)) {
            val name = nameRegex.find(m.value)?.groupValues?.getOrNull(1)?.trim() ?: continue
            val value = valRegex.find(m.value)?.groupValues?.getOrNull(1).orEmpty()
            out[name] = value
        }
        return out
    }

    private fun detectFieldNames(html: String): Triple<String, String, String> {
        var user = "username"
        var pass = "passwd"
        var cap = "captcha"
        val inputRegex = Regex("""<input[^>]+>""", RegexOption.IGNORE_CASE)
        val nameRegex = Regex("""name=["']([^"']+)["']""", RegexOption.IGNORE_CASE)
        val typeRegex = Regex("""type=["']([^"']+)["']""", RegexOption.IGNORE_CASE)
        for (m in inputRegex.findAll(html)) {
            val tag = m.value
            val name = nameRegex.find(tag)?.groupValues?.getOrNull(1) ?: continue
            val type = typeRegex.find(tag)?.groupValues?.getOrNull(1)?.lowercase().orEmpty()
            val lname = name.lowercase()
            if (type == "password" || lname.contains("pass")) {
                pass = name
            } else if (lname.contains("captcha")) {
                cap = name
            } else if (lname.contains("user") || lname.contains("roll") || lname.contains("enroll")) {
                user = name
            }
        }
        return Triple(user, pass, cap)
    }

    private fun extractPortalError(html: String): String? {
        val candidates = listOf(
            Regex("""class=["'][^"']*(?:error|alert|danger|msg)[^"']*["'][^>]*>([^<]{4,180})<""", RegexOption.IGNORE_CASE),
            Regex("""alert\(\s*["']([^"']{4,180})["']\s*\)""", RegexOption.IGNORE_CASE),
        )
        for (r in candidates) {
            val txt = r.find(html)?.groupValues?.getOrNull(1)?.replace(Regex("\\s+"), " ")?.trim()
            if (!txt.isNullOrBlank()) return txt
        }
        return null
    }

    private fun resolveUrl(raw: String, base: String): String {
        val trimmed = raw.trim()
        return when {
            trimmed.startsWith("https://", true) || trimmed.startsWith("http://", true) -> trimmed
            trimmed.startsWith("/") -> "$IPU_BASE$trimmed"
            else -> {
                val prefix = base.substringBeforeLast("/")
                "$prefix/$trimmed"
            }
        }
    }

    companion object {
        private const val IPU_BASE = "https://examweb.ggsipu.ac.in"
        private const val IPU_LOGIN_URL = "$IPU_BASE/web/login.jsp"
        private const val IPU_LOGIN_ACTION = "$IPU_BASE/web/login"
        private const val IPU_HOME_URL = "$IPU_BASE/web/student/studenthome"
        private const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

        fun fallbackSaltedSha256(password: String, captcha: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest("$password$captcha".toByteArray(Charsets.UTF_8))
            return Base64.getEncoder().encodeToString(digest)
        }
    }
}
