package com.aurora.chat.push;

import java.net.URI;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aurora.chat.common.ApiException;
import com.aurora.chat.config.AppProperties;
import com.aurora.chat.dto.PushConfigDto;
import com.aurora.chat.dto.PushSubscriptionRequest;
import com.aurora.chat.user.User;
import com.aurora.chat.user.UserRepository;

@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private final PushSubscriptionRepository subscriptions;
    private final UserRepository users;
    private final VapidKeyService vapid;
    private final WebPushSender sender;
    private final AppProperties.Push config;

    public PushService(PushSubscriptionRepository subscriptions, UserRepository users, VapidKeyService vapid,
                       WebPushSender sender, AppProperties properties) {
        this.subscriptions = subscriptions;
        this.users = users;
        this.vapid = vapid;
        this.sender = sender;
        this.config = properties.push();
    }

    public PushConfigDto config() {
        return config.enabled() ? new PushConfigDto(true, vapid.keys().publicKeyBase64()) : new PushConfigDto(false, null);
    }

    /** Saves (or moves to this user) a browser subscription. Idempotent per endpoint. */
    @Transactional
    public void subscribe(Long userId, PushSubscriptionRequest request, String userAgent) {
        requireEnabled();
        String endpoint = request.endpoint().trim();
        validateEndpoint(endpoint);
        byte[] p256dh;
        byte[] auth;
        try {
            p256dh = EcKeys.fromB64(request.keys().p256dh());
            auth = EcKeys.fromB64(request.keys().auth());
            EcKeys.decodePublic(p256dh);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid push subscription keys.");
        }
        if (auth.length != 16) {
            throw ApiException.badRequest("Invalid push subscription keys.");
        }
        User user = users.findById(userId).orElseThrow(() -> ApiException.unauthorized("Please sign in again."));
        String p256dhB64 = EcKeys.b64url(p256dh);
        String authB64 = EcKeys.b64url(auth);
        subscriptions.findByEndpoint(endpoint).ifPresentOrElse(
                existing -> existing.update(user, p256dhB64, authB64, userAgent),
                () -> subscriptions.save(new PushSubscription(user, endpoint, p256dhB64, authB64, userAgent)));
    }

    @Transactional
    public void unsubscribe(Long userId, String endpoint) {
        subscriptions.findByEndpoint(endpoint.trim())
                .filter(subscription -> subscription.getUser().getId().equals(userId))
                .ifPresent(subscriptions::delete);
    }

    /** Sends a test notification to all of the user's devices. */
    @Transactional(readOnly = true)
    public int sendTest(Long userId, byte[] payload) {
        requireEnabled();
        List<PushSubscription> list = subscriptions.findByUserId(userId);
        list.forEach(subscription -> deliver(subscription, payload, "test", true));
        return list.size();
    }

    /** Fire-and-forget delivery; subscriptions the push service reports as gone (404/410) are removed. */
    public void deliver(PushSubscription subscription, byte[] payload, String topic, boolean urgent) {
        Long id = subscription.getId();
        String host = URI.create(subscription.getEndpoint()).getHost();
        try {
            sender.send(subscription, payload, topic, urgent).whenComplete((status, error) -> {
                if (error != null) {
                    log.warn("Push to {} failed: {}", host, error.getMessage());
                } else if (status == 404 || status == 410) {
                    log.info("Push subscription on {} expired ({}); removing it", host, status);
                    subscriptions.deleteById(id);
                } else if (status / 100 != 2) {
                    log.warn("Push service {} answered {}", host, status);
                }
            });
        } catch (RuntimeException e) {
            log.warn("Push to {} failed: {}", host, e.getMessage());
        }
    }

    public boolean enabled() {
        return config.enabled();
    }

    private void requireEnabled() {
        if (!config.enabled()) {
            throw ApiException.badRequest("Push notifications are disabled on this server.");
        }
    }

    /** Only real push services are allowed, so subscriptions can't be abused to make the server call arbitrary URLs. */
    private void validateEndpoint(String endpoint) {
        URI uri;
        try {
            uri = URI.create(endpoint);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid push endpoint.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean secure = scheme.equals("https") || (config.allowInsecureEndpoints() && scheme.equals("http"));
        boolean allowed = config.allowedHosts().stream()
                .map(pattern -> pattern.trim().toLowerCase(Locale.ROOT))
                .anyMatch(pattern -> pattern.startsWith("*.") ? host.endsWith(pattern.substring(1)) : host.equals(pattern));
        if (!secure || host.isEmpty() || !allowed) {
            throw ApiException.badRequest("This browser's push service isn't supported.");
        }
    }
}
