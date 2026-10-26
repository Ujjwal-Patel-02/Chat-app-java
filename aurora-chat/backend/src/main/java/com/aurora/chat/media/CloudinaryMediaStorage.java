package com.aurora.chat.media;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Stores media on Cloudinary (free plan, no credit card) using its signed upload REST API. No SDK needed.
 * Files are then delivered straight from Cloudinary's CDN.
 */
public class CloudinaryMediaStorage implements MediaStorage {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryMediaStorage.class);

    private final CloudinaryCredentials credentials;
    private final String folder;
    private final String apiBase;
    private final HttpClient http;
    private final ObjectMapper json;

    public CloudinaryMediaStorage(CloudinaryCredentials credentials, String folder, String apiBase, HttpClient http,
                                  ObjectMapper json) {
        this.credentials = credentials;
        this.folder = folder == null ? "" : folder.trim();
        this.apiBase = apiBase.replaceAll("/+$", "");
        this.http = http;
        this.json = json;
    }

    @Override
    public StoredFile store(String key, Path file, String mimeType, boolean video) throws IOException {
        String resourceType = video ? "video" : "image";
        String publicId = key.contains(".") ? key.substring(0, key.lastIndexOf('.')) : key;
        String timestamp = String.valueOf(Instant.now().getEpochSecond());

        Map<String, String> params = new TreeMap<>();
        params.put("public_id", publicId);
        params.put("timestamp", timestamp);
        if (!folder.isEmpty()) {
            params.put("folder", folder);
        }
        String signature = sign(params, credentials.apiSecret());

        String boundary = "----aurora" + UUID.randomUUID().toString().replace("-", "");
        StringBuilder fields = new StringBuilder();
        params.forEach((name, value) -> appendField(fields, boundary, name, value));
        appendField(fields, boundary, "api_key", credentials.apiKey());
        appendField(fields, boundary, "signature", signature);
        fields.append("--").append(boundary).append("\r\n")
                .append("Content-Disposition: form-data; name=\"file\"; filename=\"").append(key).append("\"\r\n")
                .append("Content-Type: ").append(mimeType).append("\r\n\r\n");

        HttpRequest request = HttpRequest.newBuilder(uploadUri(resourceType, "upload"))
                .timeout(Duration.ofMinutes(5))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.concat(
                        HttpRequest.BodyPublishers.ofString(fields.toString(), StandardCharsets.UTF_8),
                        HttpRequest.BodyPublishers.ofFile(file),
                        HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n", StandardCharsets.UTF_8)))
                .build();
        HttpResponse<String> response = send(request);
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Cloudinary upload failed (" + response.statusCode() + "): " + abbreviate(response.body()));
        }
        JsonNode body = json.readTree(response.body());
        String secureUrl = body.path("secure_url").asText(null);
        String storedId = body.path("public_id").asText(null);
        if (secureUrl == null || storedId == null) {
            throw new IOException("Unexpected Cloudinary response: " + abbreviate(response.body()));
        }
        return new StoredFile(resourceType + ":" + storedId, secureUrl);
    }

    @Override
    public void delete(String storageKey) {
        if (storageKey == null || !storageKey.contains(":")) {
            return;
        }
        String resourceType = storageKey.substring(0, storageKey.indexOf(':'));
        String publicId = storageKey.substring(storageKey.indexOf(':') + 1);
        Map<String, String> params = new TreeMap<>();
        params.put("public_id", publicId);
        params.put("timestamp", String.valueOf(Instant.now().getEpochSecond()));
        params.put("invalidate", "true");
        String form = params.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"))
                + "&api_key=" + URLEncoder.encode(credentials.apiKey(), StandardCharsets.UTF_8)
                + "&signature=" + sign(params, credentials.apiSecret());
        HttpRequest request = HttpRequest.newBuilder(uploadUri(resourceType, "destroy"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        try {
            HttpResponse<String> response = send(request);
            if (response.statusCode() / 100 != 2) {
                log.warn("Cloudinary delete of {} failed ({}): {}", publicId, response.statusCode(), abbreviate(response.body()));
            }
        } catch (IOException e) {
            log.warn("Cloudinary delete of {} failed: {}", publicId, e.getMessage());
        }
    }

    @Override
    public Resource load(String storageKey) {
        return null; // served by Cloudinary's CDN
    }

    @Override
    public String name() {
        return "Cloudinary (cloud '" + credentials.cloudName() + "')";
    }

    /**
     * Same file with Cloudinary's {@code fl_attachment} flag, so opening the link downloads it instead of showing it:
     * {@code .../image/upload/v1/aurora-chat/abc.jpg} → {@code .../image/upload/fl_attachment:aurora-20261026/v1/aurora-chat/abc.jpg}.
     */
    public static String attachmentUrl(String deliveryUrl, String baseName) {
        int index = deliveryUrl == null ? -1 : deliveryUrl.indexOf("/upload/");
        if (index < 0) {
            return deliveryUrl;
        }
        String safe = baseName == null ? "" : baseName.replaceAll("[^A-Za-z0-9_-]", "_");
        String flag = safe.isEmpty() ? "fl_attachment" : "fl_attachment:" + safe;
        int insertAt = index + "/upload/".length();
        return deliveryUrl.substring(0, insertAt) + flag + "/" + deliveryUrl.substring(insertAt);
    }

    /** Cloudinary signature: SHA-1 of the alphabetically sorted "key=value&..." string followed by the API secret. */
    static String sign(Map<String, String> params, String apiSecret) {
        String toSign = new TreeMap<>(params).entrySet().stream()
                .filter(e -> e.getValue() != null && !e.getValue().isEmpty())
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining("&"));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest((toSign + apiSecret).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private URI uploadUri(String resourceType, String action) {
        return URI.create(apiBase + "/v1_1/" + credentials.cloudName() + "/" + resourceType + "/" + action);
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while talking to Cloudinary", e);
        }
    }

    private static void appendField(StringBuilder out, String boundary, String name, String value) {
        out.append("--").append(boundary).append("\r\n")
                .append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n")
                .append(value).append("\r\n");
    }

    private static String abbreviate(String text) {
        return text == null ? "" : text.length() > 300 ? text.substring(0, 300) + "…" : text;
    }
}
