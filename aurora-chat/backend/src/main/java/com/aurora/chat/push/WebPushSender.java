package com.aurora.chat.push;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.aurora.chat.config.AppProperties;

/** Delivers one encrypted message to a browser's push service. Returns the push service's HTTP status. */
@Component
public class WebPushSender {

    private static final Pattern TOPIC = Pattern.compile("^[A-Za-z0-9_-]{1,32}$");

    private final HttpClient http;
    private final VapidKeyService vapid;
    private final AppProperties.Push config;

    public WebPushSender(HttpClient outboundHttpClient, VapidKeyService vapid, AppProperties properties) {
        this.http = outboundHttpClient;
        this.vapid = vapid;
        this.config = properties.push();
    }

    public CompletableFuture<Integer> send(PushSubscription subscription, byte[] payload, String topic, boolean urgent) {
        URI endpoint = URI.create(subscription.getEndpoint());
        String audience = endpoint.getScheme() + "://" + endpoint.getHost() + (endpoint.getPort() == -1 ? "" : ":" + endpoint.getPort());
        VapidKeyService.VapidKeys keys = vapid.keys();
        byte[] body = WebPushCrypto.encrypt(payload, EcKeys.fromB64(subscription.getP256dh()), EcKeys.fromB64(subscription.getAuth()));
        String jwt = WebPushCrypto.vapidJwt(audience, config.subject(), keys.privateKey(), Instant.now());

        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(15))
                .header("TTL", String.valueOf(config.ttlSeconds()))
                .header("Urgency", urgent ? "high" : "normal")
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .header("Authorization", "vapid t=" + jwt + ", k=" + keys.publicKeyBase64())
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        if (topic != null && TOPIC.matcher(topic).matches()) {
            request.header("Topic", topic);
        }
        return http.sendAsync(request.build(), HttpResponse.BodyHandlers.discarding()).thenApply(HttpResponse::statusCode);
    }
}
