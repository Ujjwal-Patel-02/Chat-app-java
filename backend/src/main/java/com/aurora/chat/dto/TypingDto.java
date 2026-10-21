package com.aurora.chat.dto;

public record TypingDto(Long conversationId, UserSummaryDto user, boolean typing) {
}
