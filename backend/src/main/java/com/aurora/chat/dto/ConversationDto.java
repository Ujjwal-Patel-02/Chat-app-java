package com.aurora.chat.dto;

import java.time.Instant;
import java.util.List;

public record ConversationDto(Long id, String type, String name, List<UserDto> members, MessageDto lastMessage,
                              long unreadCount, List<ReadStateDto> readStates, Instant createdAt,
                              Instant updatedAt) {
}
