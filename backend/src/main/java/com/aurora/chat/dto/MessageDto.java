package com.aurora.chat.dto;

import java.time.Instant;
import java.util.List;

/**
 * A chat message. {@code clientId} echoes the sender's optimistic-UI id and is only present in the
 * response/event produced at send time.
 */
public record MessageDto(Long id, Long conversationId, UserSummaryDto sender, String content, Instant createdAt,
                         Instant editedAt, boolean deleted, ReplyPreviewDto replyTo, List<ReactionDto> reactions,
                         String clientId) {
}
