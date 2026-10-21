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
        @DefaultValue DemoData demoData) {

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
}
