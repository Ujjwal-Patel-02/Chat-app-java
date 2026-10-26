package com.aurora.chat.config;

import java.time.Duration;
import java.util.List;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Typed application settings bound from the {@code app.*} namespace (see application.yml).
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        @DefaultValue Jwt jwt,
        @DefaultValue Cors cors,
        @DefaultValue DemoData demoData,
        @DefaultValue Media media,
        @DefaultValue Push push,
        @DefaultValue KeepAlive keepAlive,
        /* Public base URL of this API (e.g. https://aurora-chat-api.onrender.com). Optional: used for absolute media links in push notifications. */
        @DefaultValue("") String publicUrl) {

    public record Jwt(
            @DefaultValue("change-me-local-development-secret-please-override-in-production") String secret,
            @DefaultValue("7d") Duration expiration) {
    }

    public record Cors(
            @DefaultValue({"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"})
            List<String> allowedOrigins) {
    }

    public record DemoData(@DefaultValue("false") boolean enabled) {
    }

    /**
     * Photo & video sharing. {@code storage}: auto (Cloudinary when CLOUDINARY_URL is set, else local disk), local, cloudinary.
     */
    public record Media(
            @DefaultValue("auto") String storage,
            @DefaultValue("./data/uploads") String localDir,
            @DefaultValue("10") int maxImageMb,
            @DefaultValue("50") int maxVideoMb,
            @DefaultValue("") String cloudinaryUrl,
            @DefaultValue("aurora-chat") String cloudinaryFolder,
            @DefaultValue("https://api.cloudinary.com") String cloudinaryApiBase,
            @DefaultValue("24h") Duration orphanTtl) {
    }

    /** Web Push (VAPID). Keys are generated and stored in the database when not provided. */
    public record Push(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("mailto:notifications@aurora-chat.dev") String subject,
            @DefaultValue("") String vapidPublicKey,
            @DefaultValue("") String vapidPrivateKey,
            @DefaultValue({"fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com",
                    "*.push.services.mozilla.com", "web.push.apple.com", "*.push.apple.com", "*.notify.windows.com"})
            List<String> allowedHosts,
            @DefaultValue("false") boolean allowInsecureEndpoints,
            @DefaultValue("86400") int ttlSeconds) {
    }

    /**
     * Pings this server's public URL so free hosts that sleep after ~15 idle minutes (Render) stay awake.
     * {@code url} defaults to APP_PUBLIC_URL or Render's automatic RENDER_EXTERNAL_URL, so it works with no setup on Render.
     */
    public record KeepAlive(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("") String url,
            @DefaultValue("10m") Duration interval,
            @DefaultValue("1m") Duration initialDelay) {
    }

    /**
     * Allowed browser origins, trimmed and without trailing slashes (a common copy/paste mistake).
     * Entries may be exact origins or patterns such as {@code https://*.vercel.app}.
     */
    public List<String> corsOrigins() {
        return cors.allowedOrigins().stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .map(origin -> origin.replaceAll("/+$", ""))
                .filter(origin -> !origin.isEmpty())
                .distinct()
                .toList();
    }

    /** {@link #publicUrl} without a trailing slash, or "" when unset. */
    public String publicBaseUrl() {
        return publicUrl == null ? "" : publicUrl.trim().replaceAll("/+$", "");
    }
}
