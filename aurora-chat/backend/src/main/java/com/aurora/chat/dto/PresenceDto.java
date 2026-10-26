package com.aurora.chat.dto;

import java.time.Instant;

public record PresenceDto(Long userId, boolean online, Instant lastSeenAt) {
}
