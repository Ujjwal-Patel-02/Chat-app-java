package com.aurora.chat.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import com.sun.net.httpserver.HttpServer;

class KeepAliveServiceTest {

    private static AppProperties props(String url, boolean enabled, Duration interval) {
        return new AppProperties(null, null, null, null, null,
                new AppProperties.KeepAlive(enabled, url, interval, Duration.ZERO), "");
    }

    @Test
    void resolvesHealthUrl() {
        assertThat(KeepAliveService.resolveTarget("https://aurora-chat-api.onrender.com"))
                .isEqualTo(URI.create("https://aurora-chat-api.onrender.com/api/health"));
        assertThat(KeepAliveService.resolveTarget("https://x.onrender.com/")).isEqualTo(URI.create("https://x.onrender.com/api/health"));
        assertThat(KeepAliveService.resolveTarget("x.onrender.com")).isEqualTo(URI.create("https://x.onrender.com/api/health"));
        assertThat(KeepAliveService.resolveTarget("https://x.com/api/health")).isEqualTo(URI.create("https://x.com/api/health"));
        assertThat(KeepAliveService.resolveTarget("  ")).isNull();
    }

    @Test
    void pingsHealthEndpointRepeatedly() throws Exception {
        List<String> hits = new CopyOnWriteArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            hits.add(exchange.getRequestURI().getPath() + " " + exchange.getRequestHeaders().getFirst("User-Agent"));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        try {
            KeepAliveService service = new KeepAliveService(
                    props("http://127.0.0.1:" + server.getAddress().getPort(), true, Duration.ofMillis(1100)),
                    HttpClient.newHttpClient(), scheduler);
            service.start();
            assertThat(service.isActive()).isTrue();
            long deadline = System.currentTimeMillis() + 6000;
            while (hits.size() < 3 && System.currentTimeMillis() < deadline) {
                Thread.sleep(50);
            }
            assertThat(hits).hasSizeGreaterThanOrEqualTo(3).allMatch(h -> h.equals("/api/health AuroraChat-KeepAlive/1.0"));
            assertThat(service.lastSuccess()).isNotNull();
            service.stop();
        } finally {
            scheduler.shutdown();
            server.stop(0);
        }
    }

    @Test
    void staysIdleWithoutUrlOrWhenDisabled() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        try {
            KeepAliveService noUrl = new KeepAliveService(props("", true, Duration.ofMinutes(10)), HttpClient.newHttpClient(), scheduler);
            noUrl.start();
            assertThat(noUrl.isActive()).isFalse();
            KeepAliveService off = new KeepAliveService(props("https://x.onrender.com", false, Duration.ofMinutes(10)), HttpClient.newHttpClient(), scheduler);
            off.start();
            assertThat(off.isActive()).isFalse();
        } finally {
            scheduler.shutdown();
        }
    }
}
