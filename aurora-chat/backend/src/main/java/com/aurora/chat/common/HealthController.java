package com.aurora.chat.common;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aurora.chat.config.KeepAliveService;

/**
 * Liveness endpoints. {@code /api/health} never touches the database: it is what the frontend pings to wake a
 * sleeping free instance and what the keep-alive calls every 10 minutes. {@code uptime} keeps growing while the
 * server stays awake, which makes it easy to check that keep-alive works.
 */
@RestController
public class HealthController {

    private static final Instant STARTED = Instant.now();

    private final String version;
    private final KeepAliveService keepAlive;

    public HealthController(ObjectProvider<BuildProperties> buildProperties, KeepAliveService keepAlive) {
        BuildProperties build = buildProperties.getIfAvailable();
        this.version = build != null ? build.getVersion() : "dev";
        this.keepAlive = keepAlive;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("version", version);
        body.put("time", Instant.now().toString());
        body.put("startedAt", STARTED.toString());
        body.put("uptime", formatUptime(Duration.between(STARTED, Instant.now())));
        body.put("keepAlive", keepAlive.isActive() ? "on" : "off");
        return body;
    }

    @GetMapping("/")
    public Map<String, Object> root() {
        return Map.of("name", "Aurora Chat API", "status", "UP", "version", version, "health", "/api/health", "websocket", "/ws");
    }

    static String formatUptime(Duration uptime) {
        long minutes = uptime.toMinutes();
        if (minutes < 60) {
            return minutes + "m";
        }
        long hours = minutes / 60;
        return hours < 48 ? hours + "h " + (minutes % 60) + "m" : (hours / 24) + "d " + (hours % 24) + "h";
    }
}
