package com.aurora.chat.dto;

import java.time.Instant;

public record UserDto(Long id, String username, String displayName, boolean online, Instant lastSeenAt,
                      Instant createdAt) {
}
