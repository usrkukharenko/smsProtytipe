package com.smsvxod.gateway

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GatewayApi(private val baseUrl: String, private val token: String) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    data class SmsTask(val id: String, val phone: String, val text: String)
    data class SendResult(val id: String, val ok: Boolean, val error: String? = null)

    fun pending(max: Int = 10): List<SmsTask> {
        val req = Request.Builder()
            .url("$baseUrl/api/sms/pending?max=$max")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw RuntimeException("pending HTTP ${resp.code}")
            }
            val body = resp.body?.string().orEmpty()
            val obj = JSONObject(body)
            val arr = obj.optJSONArray("tasks") ?: JSONArray()
            val out = ArrayList<SmsTask>(arr.length())
            for (i in 0 until arr.length()) {
                val t = arr.getJSONObject(i)
                out.add(
                    SmsTask(
                        id = t.getString("id"),
                        phone = t.getString("phone"),
                        text = t.getString("text")
                    )
                )
            }
            return out
        }
    }

    fun reportSent(results: List<SendResult>) {
        if (results.isEmpty()) return
        val json = JSONObject().apply {
            put("results", JSONArray().apply {
                results.forEach { r ->
                    put(JSONObject().apply {
                        put("id", r.id)
                        put("ok", r.ok)
                        if (r.error != null) put("error", r.error)
                    })
                }
            })
        }
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder()
            .url("$baseUrl/api/sms/sent")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw RuntimeException("sent HTTP ${resp.code}")
            }
        }
    }
}
