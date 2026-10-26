package com.aurora.chat.dto;

import java.time.Instant;
import java.util.List;

/** {@code muted} and {@code unreadCount} are specific to the user receiving this object. */
public record ConversationDto(Long id, String type, String name, List<UserDto> members, MessageDto lastMessage,
                              long unreadCount, List<ReadStateDto> readStates, boolean muted, Instant createdAt,
                              Instant updatedAt) {
}
