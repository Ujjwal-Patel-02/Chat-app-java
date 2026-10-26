package com.aurora.chat.dto;

/** What the browser needs to subscribe: the VAPID public key (base64url, uncompressed P-256 point). */
public record PushConfigDto(boolean enabled, String publicKey) {
}
