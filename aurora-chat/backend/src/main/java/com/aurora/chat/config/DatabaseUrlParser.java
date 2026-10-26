package com.aurora.chat.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Converts a Neon / Render / Heroku style {@code DATABASE_URL}
 * ({@code postgresql://user:password@host:5432/db?sslmode=require}) into Spring datasource properties,
 * so the connection string can be pasted as-is from the database provider's dashboard.
 */
public final class DatabaseUrlParser {

    private DatabaseUrlParser() {
    }

    public static Map<String, Object> toSpringProperties(String databaseUrl) {
        String raw = databaseUrl.trim();
        Map<String, Object> props = new LinkedHashMap<>();

        if (raw.startsWith("jdbc:")) {
            props.put("spring.datasource.url", raw);
            return props;
        }

        String lower = raw.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("postgres://") && !lower.startsWith("postgresql://")) {
            throw new IllegalArgumentException(
                    "DATABASE_URL must start with postgresql://, postgres:// or jdbc:postgresql://");
        }

        URI uri = URI.create(raw);
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("DATABASE_URL is missing a host name");
        }
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        String database = path.startsWith("/") ? path.substring(1) : path;
        if (database.isBlank()) {
            database = "postgres";
        }

        String sslMode = null;
        String query = uri.getRawQuery();
        if (query != null) {
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                String key = decode(eq >= 0 ? pair.substring(0, eq) : pair);
                String value = eq >= 0 ? decode(pair.substring(eq + 1)) : "";
                if ("sslmode".equalsIgnoreCase(key) && !value.isBlank()) {
                    sslMode = value;
                }
            }
        }
        // Cloud databases (fully-qualified host names) require TLS; local/docker hosts usually don't.
        if (sslMode == null && host.contains(".") && !host.equals("127.0.0.1")) {
            sslMode = "require";
        }

        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://")
                .append(host).append(':').append(port).append('/').append(database);
        if (sslMode != null) {
            jdbc.append("?sslmode=").append(sslMode);
        }
        props.put("spring.datasource.url", jdbc.toString());
        props.put("spring.datasource.driver-class-name", "org.postgresql.Driver");

        String userInfo = uri.getRawUserInfo();
        if (userInfo != null && !userInfo.isEmpty()) {
            int colon = userInfo.indexOf(':');
            props.put("spring.datasource.username", decode(colon >= 0 ? userInfo.substring(0, colon) : userInfo));
            if (colon >= 0) {
                props.put("spring.datasource.password", decode(userInfo.substring(colon + 1)));
            }
        }
        return props;
    }

    /** Percent-decodes without turning '+' into a space (passwords may legitimately contain '+'). */
    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
